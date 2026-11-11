use crate::error::{AppError, AppResult};
use crate::models::{SshAuthMethod, SshTunnelConfig, WorkspaceCredentials};
use ssh2::Session;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

pub struct SshTunnelHandle {
    pub local_port: u16,
    stop_flag: Arc<AtomicBool>,
}

impl SshTunnelHandle {
    /// Starts a local TCP port forwarder (`127.0.0.1:<ephemeral_port>`) that tunnels traffic
    /// through the configured SSH bastion host to `remote_host:remote_port`.
    pub fn start(
        ssh_cfg: &SshTunnelConfig,
        creds: &WorkspaceCredentials,
        remote_host: &str,
        remote_port: u16,
    ) -> AppResult<Self> {
        // First verify we can establish and authenticate an SSH session
        let test_session = Self::connect_and_auth(ssh_cfg, creds)?;
        drop(test_session);

        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| AppError::SshTunnel(format!("Failed to bind local tunnel port: {e}")))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| AppError::SshTunnel(format!("Failed to configure listener: {e}")))?;

        let local_port = listener
            .local_addr()
            .map_err(|e| AppError::SshTunnel(format!("Failed to read local tunnel address: {e}")))?
            .port();

        let stop_flag = Arc::new(AtomicBool::new(false));
        let flag_clone = Arc::clone(&stop_flag);
        let cfg_clone = ssh_cfg.clone();
        let creds_clone = creds.clone();
        let target_host = remote_host.to_string();

        thread::spawn(move || {
            while !flag_clone.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((local_stream, _)) => {
                        let c_cfg = cfg_clone.clone();
                        let c_creds = creds_clone.clone();
                        let c_host = target_host.clone();
                        let c_flag = Arc::clone(&flag_clone);
                        thread::spawn(move || {
                            let _ = Self::forward_connection(
                                local_stream,
                                &c_cfg,
                                &c_creds,
                                &c_host,
                                remote_port,
                                c_flag,
                            );
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(25));
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            local_port,
            stop_flag,
        })
    }

    fn connect_and_auth(
        ssh_cfg: &SshTunnelConfig,
        creds: &WorkspaceCredentials,
    ) -> AppResult<Session> {
        let addr = format!("{}:{}", ssh_cfg.host, ssh_cfg.port);
        let tcp = TcpStream::connect(&addr).map_err(|e| {
            AppError::SshTunnel(format!("Could not connect to SSH host {addr}: {e}"))
        })?;
        tcp.set_read_timeout(Some(Duration::from_secs(15))).ok();
        tcp.set_write_timeout(Some(Duration::from_secs(15))).ok();

        let mut sess = Session::new()
            .map_err(|e| AppError::SshTunnel(format!("Failed to initialize SSH session: {e}")))?;
        sess.set_tcp_stream(tcp);
        sess.handshake()
            .map_err(|e| AppError::SshTunnel(format!("SSH handshake failed: {e}")))?;

        match ssh_cfg.auth_method {
            SshAuthMethod::Password => {
                let pw = creds.ssh_password.as_deref().unwrap_or("");
                sess.userauth_password(&ssh_cfg.username, pw).map_err(|e| {
                    AppError::SshTunnel(format!("SSH password authentication failed: {e}"))
                })?;
            }
            SshAuthMethod::PrivateKey => {
                let key_path = ssh_cfg.private_key_path.as_deref().ok_or_else(|| {
                    AppError::SshTunnel("SSH private key path is required".into())
                })?;
                sess.userauth_pubkey_file(
                    &ssh_cfg.username,
                    None,
                    Path::new(key_path),
                    creds.ssh_passphrase.as_deref(),
                )
                .map_err(|e| {
                    AppError::SshTunnel(format!("SSH public key authentication failed: {e}"))
                })?;
            }
        }

        if !sess.authenticated() {
            return Err(AppError::SshTunnel(
                "SSH session failed to authenticate".into(),
            ));
        }

        Ok(sess)
    }

    fn forward_connection(
        mut local_stream: TcpStream,
        ssh_cfg: &SshTunnelConfig,
        creds: &WorkspaceCredentials,
        remote_host: &str,
        remote_port: u16,
        stop_flag: Arc<AtomicBool>,
    ) -> AppResult<()> {
        let sess = Self::connect_and_auth(ssh_cfg, creds)?;
        let mut channel = sess
            .channel_direct_tcpip(remote_host, remote_port, None)
            .map_err(|e| {
                AppError::SshTunnel(format!(
                    "Failed to open SSH direct-tcpip channel to {remote_host}:{remote_port}: {e}"
                ))
            })?;

        sess.set_blocking(false);
        local_stream.set_nonblocking(true).ok();

        let mut local_buf = [0u8; 16384];
        let mut remote_buf = [0u8; 16384];

        while !stop_flag.load(Ordering::Relaxed) && !channel.eof() {
            let mut progressed = false;

            match local_stream.read(&mut local_buf) {
                Ok(0) => break,
                Ok(n) => {
                    progressed = true;
                    let mut written = 0;
                    while written < n {
                        match channel.write(&local_buf[written..n]) {
                            Ok(w) => written += w,
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                thread::sleep(Duration::from_millis(5));
                            }
                            Err(_) => return Ok(()),
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }

            match channel.read(&mut remote_buf) {
                Ok(0) => {}
                Ok(n) => {
                    progressed = true;
                    let mut written = 0;
                    while written < n {
                        match local_stream.write(&remote_buf[written..n]) {
                            Ok(w) => written += w,
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                thread::sleep(Duration::from_millis(5));
                            }
                            Err(_) => return Ok(()),
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }

            if !progressed {
                thread::sleep(Duration::from_millis(5));
            }
        }

        let _ = channel.close();
        Ok(())
    }
}

impl Drop for SshTunnelHandle {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
    }
}
