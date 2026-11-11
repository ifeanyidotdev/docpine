use crate::drivers::{
    mongodb::MongoDriver, mysql::MySqlDriver, postgres::PostgresDriver, WorkspaceDriver,
};
use crate::error::{AppError, AppResult};
use crate::models::{DatabaseEngine, WorkspaceConfig, WorkspaceCredentials};
use crate::services::ssh_tunnel::SshTunnelHandle;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

struct ActiveConnection {
    driver: Arc<dyn WorkspaceDriver>,
    _ssh_tunnel: Option<SshTunnelHandle>,
}

#[derive(Default)]
pub struct WorkspacePoolManager {
    connections: RwLock<HashMap<String, ActiveConnection>>,
}

impl WorkspacePoolManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    pub async fn connect_workspace(
        &self,
        config: &WorkspaceConfig,
        creds: &WorkspaceCredentials,
    ) -> AppResult<Arc<dyn WorkspaceDriver>> {
        let (driver, tunnel) = Self::create_driver(config, creds).await?;
        let arc_driver = Arc::clone(&driver);
        let mut map = self.connections.write().await;
        map.insert(
            config.id.clone(),
            ActiveConnection {
                driver,
                _ssh_tunnel: tunnel,
            },
        );
        Ok(arc_driver)
    }

    pub async fn get_or_connect(
        &self,
        config: &WorkspaceConfig,
        creds: &WorkspaceCredentials,
    ) -> AppResult<Arc<dyn WorkspaceDriver>> {
        {
            let map = self.connections.read().await;
            if let Some(active) = map.get(&config.id) {
                return Ok(Arc::clone(&active.driver));
            }
        }
        self.connect_workspace(config, creds).await
    }

    pub async fn disconnect_workspace(&self, workspace_id: &str) {
        let mut map = self.connections.write().await;
        map.remove(workspace_id);
    }

    pub async fn test_ephemeral_connection(
        config: &WorkspaceConfig,
        creds: &WorkspaceCredentials,
    ) -> AppResult<u64> {
        let (driver, _tunnel) = Self::create_driver(config, creds).await?;
        driver.ping().await
    }

    async fn create_driver(
        config: &WorkspaceConfig,
        creds: &WorkspaceCredentials,
    ) -> AppResult<(Arc<dyn WorkspaceDriver>, Option<SshTunnelHandle>)> {
        let (target_host, target_port, tunnel_handle) = if config.ssh.enabled {
            let tunnel =
                SshTunnelHandle::start(&config.ssh, creds, &config.host, config.port)?;
            let local_port = tunnel.local_port;
            ("127.0.0.1".to_string(), local_port, Some(tunnel))
        } else {
            (config.host.clone(), config.port, None)
        };

        let driver: Arc<dyn WorkspaceDriver> = match config.engine {
            DatabaseEngine::Postgres => Arc::new(
                PostgresDriver::connect(
                    target_host,
                    target_port,
                    config.username.clone(),
                    creds.db_password.clone(),
                    config.default_database.clone(),
                    config.ssl.clone(),
                )
                .await?,
            ),
            DatabaseEngine::Mysql => Arc::new(
                MySqlDriver::connect(
                    target_host,
                    target_port,
                    config.username.clone(),
                    creds.db_password.clone(),
                    config.default_database.clone(),
                    config.ssl.clone(),
                )
                .await?,
            ),
            DatabaseEngine::Mongodb => {
                // If an SSH tunnel is active, ignore raw SRV URI and connect via forwarded host:port
                let uri = if tunnel_handle.is_some() {
                    None
                } else {
                    config.connection_uri.clone()
                };
                Arc::new(
                    MongoDriver::connect(
                        target_host,
                        target_port,
                        config.username.clone(),
                        creds.db_password.clone(),
                        config.default_database.clone(),
                        uri,
                        config.ssl.clone(),
                    )
                    .await?,
                )
            }
        };

        Ok((driver, tunnel_handle))
    }
}

pub fn map_not_connected_err(workspace_id: &str) -> AppError {
    AppError::Connection(format!("Workspace '{workspace_id}' is not connected"))
}
