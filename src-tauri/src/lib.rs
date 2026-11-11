pub mod error;
pub mod models;
pub mod services;

#[tauri::command]
fn health_check() -> String {
    "Docpine Core Ready".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![health_check])
        .run(tauri::generate_context!())
        .expect("error while running Docpine tauri application");
}
