pub mod commands;
pub mod drivers;
pub mod error;
pub mod models;
pub mod services;

use commands::AppState;
use services::{local_store::LocalStore, pool_manager::WorkspacePoolManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = LocalStore::new_default().expect("Failed to initialize Docpine local metadata store");
    let pools = WorkspacePoolManager::new();

    tauri::Builder::default()
        .manage(AppState { store, pools })
        .invoke_handler(tauri::generate_handler![
            commands::parse_uri,
            commands::build_uri,
            commands::list_workspaces,
            commands::save_workspace,
            commands::get_workspace_credentials,
            commands::update_workspace_modes,
            commands::delete_workspace,
            commands::test_workspace_connection,
            commands::connect_workspace,
            commands::disconnect_workspace,
            commands::list_databases,
            commands::get_schema_overview,
            commands::inspect_container,
            commands::fetch_data_page,
            commands::preview_mutations,
            commands::apply_mutations,
            commands::preview_schema_change,
            commands::apply_schema_change,
            commands::create_schema,
            commands::execute_query,
            commands::list_saved_queries,
            commands::save_workspace_query,
            commands::delete_saved_query,
            commands::list_query_history,
            commands::save_workspace_tabs,
            commands::get_workspace_tabs,
            commands::export_container_data,
            commands::import_container_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Docpine tauri application");
}
