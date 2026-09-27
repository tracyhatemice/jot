//! Files the app writes for the user: library exports and database backups. The page only supplies a
//! plain file name; everything goes into the Downloads folder and nothing is ever overwritten.

use crate::db::Db;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// A name the page may ask for: letters, digits, `.`, `-` and `_` only, not hidden, with an allowed extension.
pub fn safe_file_name(name: &str, extensions: &[&str]) -> Result<String, String> {
    let plain = !name.is_empty()
        && name.len() <= 100
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if plain && extensions.iter().any(|ext| name.ends_with(ext) && name.len() > ext.len()) {
        Ok(name.to_string())
    } else {
        Err(format!("unsupported file name: {name}"))
    }
}

/// `dir/name`, or `dir/stem-1.ext`, `dir/stem-2.ext`, … when that exists: never an existing file.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = name.rfind('.').map_or((name, ""), |i| (&name[..i], &name[i..]));
    (1..)
        .map(|n| dir.join(format!("{stem}-{n}{ext}")))
        .find(|path| !path.exists())
        .expect("a free file name")
}

/// Copies the open database with SQLite's online backup, so the copy is consistent even mid-write.
pub fn backup_to(conn: &Connection, target: &Path) -> rusqlite::Result<()> {
    conn.backup(rusqlite::MAIN_DB, target, None)
}

/// The system's Downloads folder, or `~/Downloads` where none is configured (a Linux desktop without
/// XDG user folders names none).
pub fn downloads_dir(download: Option<PathBuf>, home: Option<PathBuf>) -> Result<PathBuf, String> {
    download
        .or_else(|| home.map(|h| h.join("Downloads")))
        .ok_or_else(|| "no Downloads folder or home folder was found".to_string())
}

fn downloads(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = downloads_dir(app.path().download_dir().ok(), app.path().home_dir().ok())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Saves a library export (JSON) into Downloads; returns the path it went to.
#[tauri::command]
pub async fn save_text_file(app: tauri::AppHandle, name: String, text: String) -> Result<String, String> {
    let name = safe_file_name(&name, &[".json"])?;
    let path = unique_path(&downloads(&app)?, &name);
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Writes a backup copy of the library database into Downloads; returns its path.
#[tauri::command]
pub async fn db_backup(app: tauri::AppHandle, db: tauri::State<'_, Db>, name: String) -> Result<String, String> {
    let name = safe_file_name(&name, &[".sqlite"])?;
    let path = unique_path(&downloads(&app)?, &name);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    backup_to(&conn, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jot-files-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_plain_names_and_refuses_paths_or_other_types() {
        assert!(safe_file_name("jot-library-20260927-0905.json", &[".json"]).is_ok());
        for bad in ["../evil.json", "a/b.json", "a\\b.json", "C:evil.json", ".json", "x.exe", "x.sqlite", "", "空.json"] {
            assert!(safe_file_name(bad, &[".json"]).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn never_overwrites_an_existing_file() {
        let dir = temp_dir("unique");
        std::fs::write(dir.join("a.json"), "x").unwrap();
        std::fs::write(dir.join("a-1.json"), "x").unwrap();
        assert_eq!(unique_path(&dir, "a.json"), dir.join("a-2.json"));
        assert_eq!(unique_path(&dir, "b.json"), dir.join("b.json"));
    }

    #[test]
    fn falls_back_to_home_downloads_when_the_system_names_no_downloads_folder() {
        let (d, h) = (PathBuf::from("/d"), PathBuf::from("/h"));
        assert_eq!(downloads_dir(Some(d.clone()), Some(h.clone())), Ok(d));
        assert_eq!(downloads_dir(None, Some(h.clone())), Ok(h.join("Downloads")));
        assert!(downloads_dir(None, None).is_err());
    }

    #[test]
    fn backs_up_to_a_consistent_copy_that_opens() {
        let dir = temp_dir("backup");
        let conn = Connection::open(dir.join("live.sqlite3")).unwrap();
        crate::db::configure(&conn).unwrap();
        conn.execute_batch("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('春风');").unwrap();
        let target = dir.join("copy.sqlite");
        backup_to(&conn, &target).unwrap();
        let copy = Connection::open(&target).unwrap();
        let x: String = copy.query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, "春风");
    }
}
