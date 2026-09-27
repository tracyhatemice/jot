//! Native SQLite for the desktop build. Mirrors the TypeScript `SqlDriver`: `db_query` runs one
//! statement and returns rows as objects; `db_batch` runs statements in one IMMEDIATE transaction.
//! Values cross the IPC bridge as JSON; blobs travel as {"$blob": "<base64>"} (apps/client/src/platform/wire.ts).

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, TransactionBehavior};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

pub struct Db(pub Mutex<Connection>);

#[derive(Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    Ok(conn)
}

pub fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get::<_, String>(0))?;
    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    conn.busy_timeout(Duration::from_secs(5))?;
    Ok(())
}

fn to_sql(value: &Value) -> Result<SqlValue, String> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or("unsupported number")?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Object(o) => match (o.len(), o.get("$blob")) {
            (1, Some(Value::String(b64))) => SqlValue::Blob(B64.decode(b64).map_err(|e| e.to_string())?),
            _ => return Err("unsupported object parameter".into()),
        },
        Value::Array(_) => return Err("array parameters are not supported".into()),
    })
}

fn from_sql(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => {
            let mut blob = Map::new();
            blob.insert("$blob".into(), Value::String(B64.encode(b)));
            Value::Object(blob)
        }
    }
}

pub fn run_query(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let values = params.iter().map(to_sql).collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(values.iter())).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::new();
        for (i, name) in names.iter().enumerate() {
            obj.insert(name.clone(), from_sql(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(obj);
    }
    Ok(out)
}

pub fn run_batch(conn: &mut Connection, stmts: &[Stmt]) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    for s in stmts {
        run_query(&tx, &s.sql, &s.params)?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn db_query(
    db: tauri::State<'_, Db>,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<Vec<Map<String, Value>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    run_query(&conn, &sql, params.as_deref().unwrap_or(&[]))
}

#[tauri::command]
pub async fn db_batch(db: tauri::State<'_, Db>, stmts: Vec<Stmt>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    run_batch(&mut conn, &stmts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        configure(&conn).unwrap();
        conn
    }

    #[test]
    fn round_trips_every_value_type() {
        let conn = mem();
        let rows = run_query(
            &conn,
            "SELECT ? AS n, ? AS i, ? AS f, ? AS t, ? AS b",
            &[json!(null), json!(1727430000123i64), json!(1.5), json!("中文 😀"), json!({ "$blob": "AAH+/w==" })],
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(row["n"], json!(null));
        assert_eq!(row["i"], json!(1727430000123i64));
        assert_eq!(row["f"], json!(1.5));
        assert_eq!(row["t"], json!("中文 😀"));
        assert_eq!(row["b"], json!({ "$blob": "AAH+/w==" }));
    }

    #[test]
    fn batch_rolls_back_on_error() {
        let mut conn = mem();
        run_batch(&mut conn, &[Stmt { sql: "CREATE TABLE t (x INTEGER PRIMARY KEY)".into(), params: vec![] }]).unwrap();
        let err = run_batch(
            &mut conn,
            &[
                Stmt { sql: "INSERT INTO t VALUES (?)".into(), params: vec![json!(1)] },
                Stmt { sql: "INSERT INTO t VALUES (?)".into(), params: vec![json!(1)] },
            ],
        );
        assert!(err.is_err());
        assert!(run_query(&conn, "SELECT x FROM t", &[]).unwrap().is_empty());
    }

    #[test]
    fn bundled_sqlite_is_recent_and_has_fts5() {
        let conn = mem();
        let rows = run_query(&conn, "SELECT sqlite_version() AS v", &[]).unwrap();
        let version = rows[0]["v"].as_str().unwrap().to_string();
        let parts: Vec<u32> = version.split('.').map(|p| p.parse().unwrap()).collect();
        assert!(parts[0] > 3 || (parts[0] == 3 && parts[1] >= 43), "SQLite {version} < 3.43");
        run_query(
            &conn,
            "CREATE VIRTUAL TABLE f USING fts5(body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
            &[],
        )
        .unwrap();
        run_query(&conn, "INSERT INTO f (rowid, body) VALUES (1, ' 比  喻 ')", &[]).unwrap();
        let hits = run_query(&conn, "SELECT rowid FROM f WHERE f MATCH ?", &[json!("\"比 喻\"")]).unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn rejects_unsupported_params() {
        let conn = mem();
        assert!(run_query(&conn, "SELECT ?", &[json!([1, 2])]).is_err());
        assert!(run_query(&conn, "SELECT ?", &[json!({ "x": 1 })]).is_err());
    }
}
