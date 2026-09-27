mod db;
mod files;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("jot.sqlite3"))?;
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db::db_query, db::db_batch, files::save_text_file, files::db_backup])
        .run(tauri::generate_context!())
        .expect("error while running Jot");
}
