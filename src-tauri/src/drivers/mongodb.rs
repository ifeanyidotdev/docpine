use crate::drivers::WorkspaceDriver;
use crate::error::{AppError, AppResult};
use crate::models::{
    ActiveQueryProcess, ColumnMeta, ContainerKind, ContainerResourceStat, ContainerStructure,
    ContainerSummary, DataPageRequest, DataPageResult, FilterOperator, FilterRule, ForeignKeyEdge,
    IndexDefinition, MutationResult, PoolStats, QueryExecutionResult, SchemaChangeAction,
    SchemaChangeRequest, SchemaOverview, ServerResourceMetrics, SortRule, SslConfig,
    StagedBatchRequest,
};
use bson::{doc, oid::ObjectId, Bson, Document};
use futures::stream::TryStreamExt;
use mongodb::{options::ClientOptions, Client, IndexModel};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::str::FromStr;
use std::time::Instant;

pub struct MongoDriver {
    client: Client,
    default_database: String,
}

impl MongoDriver {
    pub async fn connect(
        host: String,
        port: u16,
        username: String,
        password: Option<String>,
        default_database: String,
        connection_uri: Option<String>,
        ssl: SslConfig,
    ) -> AppResult<Self> {
        let uri = if let Some(raw_uri) = connection_uri.filter(|s| !s.trim().is_empty()) {
            raw_uri
        } else {
            let auth = if !username.trim().is_empty() {
                let u = urlencoding::encode(username.trim());
                if let Some(ref pw) = password.filter(|p| !p.is_empty()) {
                    format!("{u}:{}@", urlencoding::encode(pw))
                } else {
                    format!("{u}@")
                }
            } else {
                String::new()
            };
            let db_part = if default_database.trim().is_empty() {
                "admin"
            } else {
                default_database.trim()
            };
            let tls_query = if ssl.enabled {
                if !ssl.reject_unauthorized {
                    "?tls=true&tlsAllowInvalidCertificates=true"
                } else {
                    "?tls=true"
                }
            } else {
                ""
            };
            format!("mongodb://{auth}{host}:{port}/{db_part}{tls_query}")
        };

        let client_opts = ClientOptions::parse(&uri)
            .await
            .map_err(|e| AppError::Connection(format!("Invalid MongoDB connection options: {e}")))?;

        let client = Client::with_options(client_opts)
            .map_err(|e| AppError::Connection(format!("Failed to initialize MongoDB client: {e}")))?;

        let driver = Self {
            client,
            default_database: if default_database.trim().is_empty() {
                "admin".to_string()
            } else {
                default_database
            },
        };
        let _ = driver.ping().await?;
        Ok(driver)
    }

    fn resolve_db_name<'a>(&'a self, database: &'a str) -> &'a str {
        if database.trim().is_empty() {
            &self.default_database
        } else {
            database.trim()
        }
    }
}

pub fn bson_to_clean_json(val: &Bson) -> Value {
    match val {
        Bson::Null | Bson::Undefined => Value::Null,
        Bson::Boolean(b) => Value::Bool(*b),
        Bson::Int32(i) => json!(*i),
        Bson::Int64(i) => json!(*i),
        Bson::Double(f) => json!(*f),
        Bson::String(s) => Value::String(s.clone()),
        Bson::ObjectId(oid) => Value::String(oid.to_hex()),
        Bson::DateTime(dt) => Value::String(dt.try_to_rfc3339_string().unwrap_or_else(|_| dt.to_string())),
        Bson::Decimal128(d) => Value::String(d.to_string()),
        Bson::Array(arr) => Value::Array(arr.iter().map(bson_to_clean_json).collect()),
        Bson::Document(doc) => document_to_clean_json(doc),
        Bson::Binary(bin) => Value::String(format!("Binary({} bytes)", bin.bytes.len())),
        Bson::RegularExpression(re) => Value::String(format!("/{}/{}", re.pattern, re.options)),
        Bson::Timestamp(ts) => json!({ "t": ts.time, "i": ts.increment }),
        other => Value::String(format!("{other:?}")),
    }
}

pub fn document_to_clean_json(doc: &Document) -> Value {
    let mut map = Map::with_capacity(doc.len());
    for (k, v) in doc {
        map.insert(k.clone(), bson_to_clean_json(v));
    }
    Value::Object(map)
}

pub fn json_to_bson_value(key_hint: Option<&str>, val: &Value) -> Bson {
    match val {
        Value::Null => Bson::Null,
        Value::Bool(b) => Bson::Boolean(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Bson::Int64(i)
            } else if let Some(f) = n.as_f64() {
                Bson::Double(f)
            } else {
                Bson::Null
            }
        }
        Value::String(s) => {
            // Automatically convert 24-hex strings for `_id` into BSON ObjectId when valid
            if key_hint == Some("_id") && s.len() == 24 {
                if let Ok(oid) = ObjectId::from_str(s) {
                    return Bson::ObjectId(oid);
                }
            }
            Bson::String(s.clone())
        }
        Value::Array(arr) => Bson::Array(arr.iter().map(|v| json_to_bson_value(None, v)).collect()),
        Value::Object(obj) => {
            // Support Extended JSON `{"$oid": "..."}`
            if obj.len() == 1 {
                if let Some(Value::String(oid_str)) = obj.get("$oid") {
                    if let Ok(oid) = ObjectId::from_str(oid_str) {
                        return Bson::ObjectId(oid);
                    }
                }
            }
            let mut d = Document::new();
            for (k, v) in obj {
                d.insert(k.clone(), json_to_bson_value(Some(k.as_str()), v));
            }
            Bson::Document(d)
        }
    }
}

pub fn json_object_to_document(val: &Value) -> AppResult<Document> {
    let obj = val
        .as_object()
        .ok_or_else(|| AppError::Validation("Expected a JSON object for MongoDB document".into()))?;
    let mut doc = Document::new();
    for (k, v) in obj {
        doc.insert(k.clone(), json_to_bson_value(Some(k.as_str()), v));
    }
    Ok(doc)
}

pub fn bson_type_label(val: &Bson) -> &'static str {
    match val {
        Bson::ObjectId(_) => "ObjectId",
        Bson::String(_) => "String",
        Bson::Int32(_) => "Int32",
        Bson::Int64(_) => "Int64",
        Bson::Double(_) => "Double",
        Bson::Boolean(_) => "Boolean",
        Bson::DateTime(_) => "ISODate",
        Bson::Array(_) => "Array",
        Bson::Document(_) => "Object",
        Bson::Null => "Null",
        Bson::Decimal128(_) => "Decimal128",
        _ => "BSON",
    }
}

pub fn build_mongo_filter(filters: &[FilterRule], raw_filter: Option<&str>) -> AppResult<Document> {
    let mut doc = if let Some(raw) = raw_filter.map(str::trim).filter(|s| !s.is_empty()) {
        let parsed: Value = serde_json::from_str(raw).map_err(|e| {
            AppError::Validation(format!("Invalid MongoDB filter JSON `{raw}`: {e}"))
        })?;
        json_object_to_document(&parsed)?
    } else {
        Document::new()
    };

    for rule in filters.iter().filter(|r| r.enabled && !r.field.trim().is_empty()) {
        let field = rule.field.trim();
        let val_bson = parse_scalar_or_oid(field, &rule.value);
        let clause = match rule.operator {
            FilterOperator::Eq => val_bson,
            FilterOperator::Neq => Bson::Document(doc! { "$ne": val_bson }),
            FilterOperator::Gt => Bson::Document(doc! { "$gt": val_bson }),
            FilterOperator::Gte => Bson::Document(doc! { "$gte": val_bson }),
            FilterOperator::Lt => Bson::Document(doc! { "$lt": val_bson }),
            FilterOperator::Lte => Bson::Document(doc! { "$lte": val_bson }),
            FilterOperator::Contains => Bson::Document(doc! {
                "$regex": rule.value.clone(),
                "$options": "i"
            }),
            FilterOperator::StartsWith => Bson::Document(doc! {
                "$regex": format!("^{}", rule.value),
                "$options": "i"
            }),
            FilterOperator::In => {
                let items: Vec<Bson> = rule
                    .value
                    .split(',')
                    .map(|item| parse_scalar_or_oid(field, item.trim()))
                    .collect();
                Bson::Document(doc! { "$in": items })
            }
            FilterOperator::IsNull => Bson::Null,
            FilterOperator::IsNotNull => Bson::Document(doc! { "$ne": Bson::Null }),
        };
        doc.insert(field.to_string(), clause);
    }

    Ok(doc)
}

fn parse_scalar_or_oid(field: &str, raw: &str) -> Bson {
    if field == "_id" && raw.len() == 24 {
        if let Ok(oid) = ObjectId::from_str(raw) {
            return Bson::ObjectId(oid);
        }
    }
    if let Ok(i) = raw.parse::<i64>() {
        return Bson::Int64(i);
    }
    if let Ok(f) = raw.parse::<f64>() {
        return Bson::Double(f);
    }
    if raw.eq_ignore_ascii_case("true") {
        return Bson::Boolean(true);
    }
    if raw.eq_ignore_ascii_case("false") {
        return Bson::Boolean(false);
    }
    Bson::String(raw.to_string())
}

pub fn build_mongo_sort(sorts: &[SortRule]) -> Document {
    let mut sort_doc = Document::new();
    for s in sorts.iter().filter(|r| !r.field.trim().is_empty()) {
        sort_doc.insert(s.field.trim().to_string(), if s.descending { -1 } else { 1 });
    }
    sort_doc
}

pub fn preview_mongo_mutations(req: &StagedBatchRequest) -> AppResult<Vec<String>> {
    let coll = &req.container;
    let mut ops = Vec::new();

    for ins in &req.inserts {
        let pretty = serde_json::to_string(ins).unwrap_or_else(|_| "{}".into());
        ops.push(format!("db.{coll}.insertOne({pretty});"));
    }

    for upd in &req.updates {
        if upd.changes.is_empty() {
            continue;
        }
        let filter_json = serde_json::to_string(&upd.identity).unwrap_or_else(|_| "{}".into());
        let set_json = serde_json::to_string(&upd.changes).unwrap_or_else(|_| "{}".into());
        ops.push(format!(
            "db.{coll}.updateOne({filter_json}, {{ \"$set\": {set_json} }});"
        ));
    }

    for del in &req.deletes {
        let filter_json = serde_json::to_string(del).unwrap_or_else(|_| "{}".into());
        ops.push(format!("db.{coll}.deleteOne({filter_json});"));
    }

    Ok(ops)
}

#[async_trait::async_trait]
impl WorkspaceDriver for MongoDriver {
    async fn ping(&self) -> AppResult<u64> {
        let start = Instant::now();
        self.client
            .database(&self.default_database)
            .run_command(doc! { "ping": 1 })
            .await
            .map_err(|e| AppError::Connection(format!("MongoDB ping failed: {e}")))?;
        Ok(start.elapsed().as_millis() as u64)
    }

    async fn list_databases(&self) -> AppResult<Vec<String>> {
        self.client
            .list_database_names()
            .await
            .map_err(|e| AppError::Query(format!("Failed to list MongoDB databases: {e}")))
    }

    async fn get_schema_overview(&self, database: &str) -> AppResult<SchemaOverview> {
        let db_name = self.resolve_db_name(database);
        let db = self.client.database(db_name);

        let mut coll_names = db
            .list_collection_names()
            .await
            .map_err(|e| AppError::Query(format!("Failed to list MongoDB collections: {e}")))?;
        coll_names.sort();

        let coll_set: HashSet<String> = coll_names.iter().cloned().collect();
        let mut containers = Vec::with_capacity(coll_names.len());
        let mut columns_by_container: HashMap<String, Vec<ColumnMeta>> = HashMap::new();
        let mut foreign_keys: Vec<ForeignKeyEdge> = Vec::new();

        for name in &coll_names {
            let coll = db.collection::<Document>(name);
            let est = coll.estimated_document_count().await.ok();
            containers.push(ContainerSummary {
                name: name.clone(),
                schema: None,
                kind: ContainerKind::Collection,
                estimated_rows: est,
                row_count_capped: false,
            });

            // Sample up to 20 documents to infer field names and BSON types
            let mut field_types: BTreeMap<String, String> = BTreeMap::new();
            field_types.insert("_id".to_string(), "ObjectId".to_string());

            if let Ok(mut cursor) = coll.find(doc! {}).limit(20).await {
                while let Ok(Some(doc_item)) = cursor.try_next().await {
                    for (k, v) in &doc_item {
                        field_types
                            .entry(k.clone())
                            .or_insert_with(|| bson_type_label(v).to_string());
                    }
                }
            }

            let mut cols = Vec::with_capacity(field_types.len());
            for (fname, ftype) in field_types {
                // Infer references from `user_id` -> `users._id` or `user`
                let mut fk_target = None;
                if let Some(prefix) = fname.strip_suffix("_id") {
                    let plural = format!("{prefix}s");
                    if coll_set.contains(&plural) {
                        fk_target = Some(format!("{plural}._id"));
                        foreign_keys.push(ForeignKeyEdge {
                            constraint_name: format!("{name}_{fname}_ref"),
                            source_schema: None,
                            source_container: name.clone(),
                            source_column: fname.clone(),
                            target_schema: None,
                            target_container: plural,
                            target_column: "_id".into(),
                            on_delete: None,
                        });
                    } else if coll_set.contains(prefix) {
                        fk_target = Some(format!("{prefix}._id"));
                        foreign_keys.push(ForeignKeyEdge {
                            constraint_name: format!("{name}_{fname}_ref"),
                            source_schema: None,
                            source_container: name.clone(),
                            source_column: fname.clone(),
                            target_schema: None,
                            target_container: prefix.to_string(),
                            target_column: "_id".into(),
                            on_delete: None,
                        });
                    }
                }

                cols.push(ColumnMeta {
                    is_primary_key: fname == "_id",
                    name: fname,
                    data_type: ftype,
                    is_nullable: true,
                    default_value: None,
                    foreign_key_target: fk_target,
                });
            }

            columns_by_container.insert(name.clone(), cols);
        }

        Ok(SchemaOverview {
            database: db_name.to_string(),
            schemas: vec![],
            containers,
            columns_by_container,
            foreign_keys,
        })
    }

    async fn inspect_container(
        &self,
        database: &str,
        _schema: Option<&str>,
        name: &str,
    ) -> AppResult<ContainerStructure> {
        let overview = self.get_schema_overview(database).await?;
        let columns = overview
            .columns_by_container
            .get(name)
            .cloned()
            .unwrap_or_else(|| {
                vec![ColumnMeta {
                    name: "_id".into(),
                    data_type: "ObjectId".into(),
                    is_primary_key: true,
                    is_nullable: false,
                    default_value: None,
                    foreign_key_target: None,
                }]
            });

        let foreign_keys: Vec<ForeignKeyEdge> = overview
            .foreign_keys
            .into_iter()
            .filter(|fk| fk.source_container == name)
            .collect();

        let db = self.client.database(&overview.database);
        let coll = db.collection::<Document>(name);
        let mut indexes = Vec::new();
        if let Ok(mut idx_cursor) = coll.list_indexes().await {
            while let Ok(Some(idx_model)) = idx_cursor.try_next().await {
                let idx_cols: Vec<String> = idx_model.keys.keys().cloned().collect();
                let idx_name = idx_model
                    .options
                    .as_ref()
                    .and_then(|o| o.name.clone())
                    .unwrap_or_else(|| idx_cols.join("_"));
                let is_unique = idx_model
                    .options
                    .as_ref()
                    .and_then(|o| o.unique)
                    .unwrap_or(false)
                    || idx_name == "_id_";
                indexes.push(IndexDefinition {
                    is_primary: idx_name == "_id_",
                    name: idx_name,
                    columns: idx_cols,
                    is_unique,
                    index_type: Some("btree".into()),
                });
            }
        }

        Ok(ContainerStructure {
            database: overview.database,
            schema: None,
            name: name.to_string(),
            kind: ContainerKind::Collection,
            columns,
            indexes,
            foreign_keys,
            ddl_statement: Some(format!("db.createCollection(\"{name}\");")),
        })
    }

    async fn fetch_data_page(&self, req: &DataPageRequest) -> AppResult<DataPageResult> {
        let start = Instant::now();
        let db_name = self.resolve_db_name(&req.database);
        let db = self.client.database(db_name);
        let coll = db.collection::<Document>(&req.container);

        let filter_doc = build_mongo_filter(&req.filters, req.raw_filter.as_deref())?;
        let sort_doc = build_mongo_sort(&req.sorts);
        let page_size = req.page_size.clamp(1, 5000);
        let skip = (req.page.saturating_sub(1) as u64) * (page_size as u64);

        let mut find_action = coll
            .find(filter_doc.clone())
            .skip(skip)
            .limit(page_size as i64);
        if !sort_doc.is_empty() {
            find_action = find_action.sort(sort_doc.clone());
        }

        let mut cursor = find_action
            .await
            .map_err(|e| AppError::Query(format!("MongoDB find failed: {e}")))?;

        let mut rows = Vec::new();
        let mut discovered_fields: BTreeMap<String, String> = BTreeMap::new();
        discovered_fields.insert("_id".to_string(), "ObjectId".to_string());

        while let Some(doc_item) = cursor
            .try_next()
            .await
            .map_err(|e| AppError::Query(format!("MongoDB cursor error: {e}")))?
        {
            for (k, v) in &doc_item {
                discovered_fields
                    .entry(k.clone())
                    .or_insert_with(|| bson_type_label(v).to_string());
            }
            rows.push(document_to_clean_json(&doc_item));
        }

        let columns: Vec<ColumnMeta> = discovered_fields
            .into_iter()
            .map(|(name, dtype)| ColumnMeta {
                is_primary_key: name == "_id",
                name,
                data_type: dtype,
                is_nullable: true,
                default_value: None,
                foreign_key_target: None,
            })
            .collect();

        let total_count = coll.count_documents(filter_doc.clone()).await.ok();

        let filter_json = serde_json::to_string(&document_to_clean_json(&filter_doc))
            .unwrap_or_else(|_| "{}".into());
        let generated_query = format!(
            "db.{}.find({}).skip({}).limit({});",
            req.container, filter_json, skip, page_size
        );

        Ok(DataPageResult {
            columns,
            rows,
            primary_keys: vec!["_id".to_string()],
            total_count,
            page: req.page,
            page_size,
            execution_ms: start.elapsed().as_millis() as u64,
            generated_query,
        })
    }

    async fn preview_mutations(&self, req: &StagedBatchRequest) -> AppResult<Vec<String>> {
        preview_mongo_mutations(req)
    }

    async fn apply_mutations(&self, req: &StagedBatchRequest) -> AppResult<MutationResult> {
        let start = Instant::now();
        let statements = preview_mongo_mutations(req)?;
        if statements.is_empty() {
            return Ok(MutationResult {
                inserted_count: 0,
                updated_count: 0,
                deleted_count: 0,
                execution_ms: 0,
                statements,
            });
        }

        let db_name = self.resolve_db_name(&req.database);
        let coll = self
            .client
            .database(db_name)
            .collection::<Document>(&req.container);

        let mut inserted_count = 0u64;
        for ins in &req.inserts {
            let doc_item = json_object_to_document(ins)?;
            coll.insert_one(doc_item)
                .await
                .map_err(|e| AppError::Query(format!("MongoDB insertOne failed: {e}")))?;
            inserted_count += 1;
        }

        let mut updated_count = 0u64;
        for upd in &req.updates {
            if upd.changes.is_empty() {
                continue;
            }
            let filter_val = serde_json::to_value(&upd.identity)?;
            let filter_doc = json_object_to_document(&filter_val)?;
            let changes_val = serde_json::to_value(&upd.changes)?;
            let set_doc = json_object_to_document(&changes_val)?;

            let res = coll
                .update_one(filter_doc, doc! { "$set": set_doc })
                .await
                .map_err(|e| AppError::Query(format!("MongoDB updateOne failed: {e}")))?;
            updated_count += res.modified_count;
        }

        let mut deleted_count = 0u64;
        for del in &req.deletes {
            let filter_val = serde_json::to_value(del)?;
            let filter_doc = json_object_to_document(&filter_val)?;
            let res = coll
                .delete_one(filter_doc)
                .await
                .map_err(|e| AppError::Query(format!("MongoDB deleteOne failed: {e}")))?;
            deleted_count += res.deleted_count;
        }

        Ok(MutationResult {
            inserted_count,
            updated_count,
            deleted_count,
            execution_ms: start.elapsed().as_millis() as u64,
            statements,
        })
    }

    async fn preview_schema_change(&self, change: &SchemaChangeRequest) -> AppResult<String> {
        let coll = &change.container;
        match &change.change {
            SchemaChangeAction::CreateContainer { .. } => {
                Ok(format!("db.createCollection(\"{coll}\");"))
            }
            SchemaChangeAction::DropContainer => Ok(format!("db.{coll}.drop();")),
            SchemaChangeAction::CreateIndex {
                index_name,
                columns,
                is_unique,
            } => {
                let keys: Map<String, Value> =
                    columns.iter().map(|c| (c.clone(), json!(1))).collect();
                Ok(format!(
                    "db.{coll}.createIndex({}, {{ name: \"{index_name}\", unique: {is_unique} }});",
                    Value::Object(keys)
                ))
            }
            SchemaChangeAction::DropIndex { index_name } => {
                Ok(format!("db.{coll}.dropIndex(\"{index_name}\");"))
            }
            _ => Ok(format!(
                "// MongoDB collections are schema-flexible; fields update dynamically on `{coll}`"
            )),
        }
    }

    async fn apply_schema_change(
        &self,
        change: &SchemaChangeRequest,
    ) -> AppResult<QueryExecutionResult> {
        let start = Instant::now();
        let preview = self.preview_schema_change(change).await?;
        let db_name = self.resolve_db_name(&change.database);
        let db = self.client.database(db_name);

        match &change.change {
            SchemaChangeAction::CreateContainer { .. } => {
                db.create_collection(&change.container).await.map_err(|e| {
                    AppError::Query(format!("Failed to create MongoDB collection: {e}"))
                })?;
            }
            SchemaChangeAction::DropContainer => {
                db.collection::<Document>(&change.container)
                    .drop()
                    .await
                    .map_err(|e| {
                        AppError::Query(format!("Failed to drop MongoDB collection: {e}"))
                    })?;
            }
            SchemaChangeAction::CreateIndex {
                index_name,
                columns,
                is_unique,
            } => {
                let mut keys = Document::new();
                for c in columns {
                    keys.insert(c.clone(), 1);
                }
                let opts = mongodb::options::IndexOptions::builder()
                    .name(index_name.clone())
                    .unique(*is_unique)
                    .build();
                let model = IndexModel::builder().keys(keys).options(opts).build();
                db.collection::<Document>(&change.container)
                    .create_index(model)
                    .await
                    .map_err(|e| AppError::Query(format!("Failed to create MongoDB index: {e}")))?;
            }
            SchemaChangeAction::DropIndex { index_name } => {
                db.collection::<Document>(&change.container)
                    .drop_index(index_name)
                    .await
                    .map_err(|e| AppError::Query(format!("Failed to drop MongoDB index: {e}")))?;
            }
            _ => {}
        }

        Ok(QueryExecutionResult {
            columns: vec![],
            rows: vec![],
            affected_rows: Some(1),
            execution_ms: start.elapsed().as_millis() as u64,
            query: preview,
            is_mutation: true,
            message: Some("MongoDB collection/index operation completed".into()),
        })
    }

    async fn create_schema(
        &self,
        _database: &str,
        _schema: &str,
    ) -> AppResult<QueryExecutionResult> {
        Err(AppError::Validation(
            "MongoDB does not use relational schemas. Create collections directly instead.".into(),
        ))
    }

    async fn execute_raw_query(
        &self,
        database: &str,
        query: &str,
    ) -> AppResult<QueryExecutionResult> {
        let start = Instant::now();
        let db_name = self.resolve_db_name(database);
        let db = self.client.database(db_name);

        let cmd_json: Value = serde_json::from_str(query.trim()).map_err(|e| {
            AppError::Validation(format!(
                "MongoDB Query Editor expects JSON command format (e.g. {{\"action\": \"find\", \"collection\": \"users\", \"filter\": {{}}}}): {e}"
            ))
        })?;

        let action = cmd_json
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("runCommand");
        let collection_name = cmd_json
            .get("collection")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match action {
            "find" => {
                if collection_name.is_empty() {
                    return Err(AppError::Validation(
                        "MongoDB `find` requires a `collection` field".into(),
                    ));
                }
                let filter_doc = cmd_json
                    .get("filter")
                    .map(json_object_to_document)
                    .transpose()?
                    .unwrap_or_default();
                let limit = cmd_json
                    .get("limit")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(100);

                let coll = db.collection::<Document>(collection_name);
                let mut find_op = coll.find(filter_doc).limit(limit);
                if let Some(sort_val) = cmd_json.get("sort") {
                    find_op = find_op.sort(json_object_to_document(sort_val)?);
                }
                if let Some(proj_val) = cmd_json.get("projection") {
                    find_op = find_op.projection(json_object_to_document(proj_val)?);
                }

                let mut cursor = find_op
                    .await
                    .map_err(|e| AppError::Query(format!("MongoDB find error: {e}")))?;

                let mut rows = Vec::new();
                let mut col_names = BTreeMap::new();
                while let Some(d) = cursor
                    .try_next()
                    .await
                    .map_err(|e| AppError::Query(format!("MongoDB cursor error: {e}")))?
                {
                    for (k, v) in &d {
                        col_names
                            .entry(k.clone())
                            .or_insert_with(|| bson_type_label(v).to_string());
                    }
                    rows.push(document_to_clean_json(&d));
                }

                let columns = col_names
                    .into_iter()
                    .map(|(name, data_type)| ColumnMeta {
                        is_primary_key: name == "_id",
                        name,
                        data_type,
                        is_nullable: true,
                        default_value: None,
                        foreign_key_target: None,
                    })
                    .collect();

                let count = rows.len() as u64;
                Ok(QueryExecutionResult {
                    columns,
                    rows,
                    affected_rows: Some(count),
                    execution_ms: start.elapsed().as_millis() as u64,
                    query: query.to_string(),
                    is_mutation: false,
                    message: Some(format!("Found {count} document(s)")),
                })
            }
            "aggregate" => {
                if collection_name.is_empty() {
                    return Err(AppError::Validation(
                        "MongoDB `aggregate` requires a `collection` field".into(),
                    ));
                }
                let pipeline_arr = cmd_json
                    .get("pipeline")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        AppError::Validation(
                            "MongoDB `aggregate` requires a `pipeline` array".into(),
                        )
                    })?;

                let mut pipeline = Vec::with_capacity(pipeline_arr.len());
                for stage in pipeline_arr {
                    pipeline.push(json_object_to_document(stage)?);
                }

                let coll = db.collection::<Document>(collection_name);
                let mut cursor = coll
                    .aggregate(pipeline)
                    .await
                    .map_err(|e| AppError::Query(format!("MongoDB aggregate error: {e}")))?;

                let mut rows = Vec::new();
                let mut col_names = BTreeMap::new();
                while let Some(d) = cursor
                    .try_next()
                    .await
                    .map_err(|e| AppError::Query(format!("MongoDB cursor error: {e}")))?
                {
                    for (k, v) in &d {
                        col_names
                            .entry(k.clone())
                            .or_insert_with(|| bson_type_label(v).to_string());
                    }
                    rows.push(document_to_clean_json(&d));
                }

                let columns = col_names
                    .into_iter()
                    .map(|(name, data_type)| ColumnMeta {
                        is_primary_key: name == "_id",
                        name,
                        data_type,
                        is_nullable: true,
                        default_value: None,
                        foreign_key_target: None,
                    })
                    .collect();

                let count = rows.len() as u64;
                Ok(QueryExecutionResult {
                    columns,
                    rows,
                    affected_rows: Some(count),
                    execution_ms: start.elapsed().as_millis() as u64,
                    query: query.to_string(),
                    is_mutation: false,
                    message: Some(format!("Aggregation returned {count} document(s)")),
                })
            }
            _ => {
                let raw_cmd = if let Some(cmd_inner) = cmd_json.get("command") {
                    json_object_to_document(cmd_inner)?
                } else {
                    json_object_to_document(&cmd_json)?
                };
                let reply = db
                    .run_command(raw_cmd)
                    .await
                    .map_err(|e| AppError::Query(format!("MongoDB command failed: {e}")))?;
                let json_reply = document_to_clean_json(&reply);
                Ok(QueryExecutionResult {
                    columns: vec![ColumnMeta {
                        name: "result".into(),
                        data_type: "Object".into(),
                        is_primary_key: false,
                        is_nullable: false,
                        default_value: None,
                        foreign_key_target: None,
                    }],
                    rows: vec![json_reply],
                    affected_rows: Some(1),
                    execution_ms: start.elapsed().as_millis() as u64,
                    query: query.to_string(),
                    is_mutation: false,
                    message: Some("Command executed successfully".into()),
                })
            }
        }
    }

    async fn collect_metrics(&self, database: &str) -> AppResult<ServerResourceMetrics> {
        let db_name = self.resolve_db_name(database);
        let db = self.client.database(db_name);
        let admin_db = self.client.database("admin");
        let mut metrics = ServerResourceMetrics::default();

        // 1. dbStats for current database
        match db.run_command(doc! { "dbStats": 1 }).await {
            Ok(doc) => {
                let data_size = bson_doc_u64(&doc, "dataSize").unwrap_or(0);
                let index_size = bson_doc_u64(&doc, "indexSize").unwrap_or(0);
                let storage_size = bson_doc_u64(&doc, "storageSize").unwrap_or(0);
                metrics.database_size_bytes = Some(storage_size.max(data_size) + index_size);
            }
            Err(e) => {
                metrics
                    .warnings
                    .push(format!("Could not run dbStats: {e}"));
            }
        }

        // 2. serverStatus (requires clusterMonitor or admin privileges on managed Atlas clusters)
        match admin_db.run_command(doc! { "serverStatus": 1 }).await {
            Ok(doc) => {
                if let Ok(ver) = doc.get_str("version") {
                    metrics.version = Some(format!("MongoDB {ver}"));
                }
                metrics.uptime_seconds = bson_doc_u64(&doc, "uptime");

                if let Ok(conns) = doc.get_document("connections") {
                    let current = bson_doc_u64(conns, "current");
                    let available = bson_doc_u64(conns, "available");
                    let active = bson_doc_u64(conns, "active").or(current);
                    metrics.active_connections = active;
                    if let (Some(curr), Some(act)) = (current, active) {
                        metrics.idle_connections = Some(curr.saturating_sub(act));
                    }
                    if let (Some(curr), Some(avail)) = (current, available) {
                        metrics.max_connections = Some(curr + avail);
                    }
                }

                if let Ok(mem) = doc.get_document("mem") {
                    metrics.memory_mb = bson_doc_f64(mem, "resident");
                }

                if let Ok(ops) = doc.get_document("opcounters") {
                    let query = bson_doc_u64(ops, "query").unwrap_or(0);
                    let getmore = bson_doc_u64(ops, "getmore").unwrap_or(0);
                    let insert = bson_doc_u64(ops, "insert").unwrap_or(0);
                    let update = bson_doc_u64(ops, "update").unwrap_or(0);
                    let delete = bson_doc_u64(ops, "delete").unwrap_or(0);
                    let command = bson_doc_u64(ops, "command").unwrap_or(0);
                    let reads = query + getmore;
                    let writes = insert + update + delete;
                    metrics.total_reads = Some(reads);
                    metrics.total_writes = Some(writes);
                    metrics.total_operations = Some(reads + writes + command);
                }

                if let Ok(wt) = doc.get_document("wiredTiger") {
                    if let Ok(cache) = wt.get_document("cache") {
                        let bytes_in_cache =
                            bson_doc_f64(cache, "bytes currently in the cache").unwrap_or(0.0);
                        let max_bytes =
                            bson_doc_f64(cache, "maximum bytes configured").unwrap_or(0.0);
                        if max_bytes > 0.0 {
                            // Report cache utilization complement or hit proxy if available
                            let pages_read =
                                bson_doc_f64(cache, "pages read into cache").unwrap_or(0.0);
                            let pages_requested =
                                bson_doc_f64(cache, "pages requested from the cache")
                                    .unwrap_or(0.0);
                            if pages_requested > 0.0 {
                                let ratio =
                                    ((pages_requested - pages_read).max(0.0) / pages_requested)
                                        * 100.0;
                                metrics.cache_hit_ratio = Some(ratio.clamp(0.0, 100.0));
                            } else if bytes_in_cache > 0.0 {
                                metrics.cache_hit_ratio =
                                    Some((bytes_in_cache / max_bytes * 100.0).clamp(0.0, 100.0));
                            }
                        }
                    }
                }
            }
            Err(_) => {
                // Fallback: try buildInfo for version
                if let Ok(info) = db.run_command(doc! { "buildInfo": 1 }).await {
                    if let Ok(ver) = info.get_str("version") {
                        metrics.version = Some(format!("MongoDB {ver}"));
                    }
                }
                metrics.warnings.push(
                    "serverStatus requires clusterMonitor privilege; showing database-scoped stats."
                        .into(),
                );
            }
        }

        // 3. Active operations via currentOp (optional privilege)
        match admin_db
            .run_command(doc! { "currentOp": 1, "active": true })
            .await
        {
            Ok(doc) => {
                if let Ok(inprog) = doc.get_array("inprog") {
                    let mut active_ops = Vec::new();
                    for item in inprog.iter().take(25) {
                        if let Some(op_doc) = item.as_document() {
                            let op_type = op_doc.get_str("op").unwrap_or("op");
                            let ns = op_doc.get_str("ns").unwrap_or("");
                            let cmd_str = op_doc
                                .get_document("command")
                                .ok()
                                .map(|d| document_to_clean_json(d).to_string())
                                .unwrap_or_else(|| format!("{op_type} on {ns}"));
                            if cmd_str.contains("\"currentOp\"") {
                                continue;
                            }
                            let duration_ms = bson_doc_u64(op_doc, "microsecs_running")
                                .map(|us| us / 1000)
                                .or_else(|| bson_doc_u64(op_doc, "secs_running").map(|s| s * 1000))
                                .unwrap_or(0);
                            let id = op_doc
                                .get("opid")
                                .map(|v| bson_to_clean_json(v).to_string())
                                .unwrap_or_else(|| "op".into());
                            let user = op_doc
                                .get_array("effectiveUsers")
                                .ok()
                                .and_then(|arr| arr.first())
                                .and_then(|u| u.as_document())
                                .and_then(|u| u.get_str("user").ok())
                                .map(|s| s.to_string());
                            active_ops.push(ActiveQueryProcess {
                                id,
                                user,
                                database: ns.split('.').next().map(|s| s.to_string()),
                                state: Some(op_type.to_string()),
                                duration_ms,
                                query: cmd_str.chars().take(500).collect(),
                                wait_event: None,
                            });
                        }
                    }
                    metrics.active_queries = active_ops;
                }
            }
            Err(_) => {
                // Non-fatal: many hosted MongoDB users do not have inprog/currentOp role
            }
        }

        // 4. Top collections by storage size (inspect up to 30 collections to stay fast)
        if let Ok(names) = db.list_collection_names().await {
            let mut stats_list = Vec::new();
            for col_name in names.into_iter().take(30) {
                if let Ok(stat_doc) = db.run_command(doc! { "collStats": &col_name }).await {
                    let data_bytes = bson_doc_u64(&stat_doc, "size").unwrap_or(0);
                    let index_bytes = bson_doc_u64(&stat_doc, "totalIndexSize").unwrap_or(0);
                    let storage_bytes = bson_doc_u64(&stat_doc, "storageSize").unwrap_or(data_bytes);
                    let count = bson_doc_u64(&stat_doc, "count");
                    stats_list.push(ContainerResourceStat {
                        name: col_name,
                        schema: None,
                        total_size_bytes: storage_bytes.max(data_bytes) + index_bytes,
                        data_size_bytes: data_bytes,
                        index_size_bytes: index_bytes,
                        estimated_rows: count,
                    });
                }
            }
            stats_list.sort_by(|a, b| b.total_size_bytes.cmp(&a.total_size_bytes));
            stats_list.truncate(10);
            metrics.top_containers = stats_list;
        }

        Ok(metrics)
    }

    async fn pool_stats(&self) -> PoolStats {
        PoolStats {
            active: 0,
            idle: 0,
            max: 100,
            tracked: false,
        }
    }
}

fn bson_doc_u64(doc: &Document, key: &str) -> Option<u64> {
    match doc.get(key)? {
        Bson::Int32(i) => Some((*i).max(0) as u64),
        Bson::Int64(i) => Some((*i).max(0) as u64),
        Bson::Double(f) => Some(f.max(0.0) as u64),
        _ => None,
    }
}

fn bson_doc_f64(doc: &Document, key: &str) -> Option<f64> {
    match doc.get(key)? {
        Bson::Int32(i) => Some(*i as f64),
        Bson::Int64(i) => Some(*i as f64),
        Bson::Double(f) => Some(*f),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RecordUpdate;

    #[test]
    fn test_bson_and_oid_conversion() {
        let hex = "507f1f77bcf86cd799439011";
        let bson_val = json_to_bson_value(Some("_id"), &json!(hex));
        assert!(matches!(bson_val, Bson::ObjectId(_)));
        assert_eq!(bson_to_clean_json(&bson_val), json!(hex));
    }

    #[test]
    fn test_build_mongo_filter_and_mutations() {
        let rules = vec![FilterRule {
            field: "status".into(),
            operator: FilterOperator::Eq,
            value: "active".into(),
            enabled: true,
        }];
        let filter_doc = build_mongo_filter(&rules, Some(r#"{"tier": "pro"}"#)).unwrap();
        assert_eq!(filter_doc.get_str("status").unwrap(), "active");
        assert_eq!(filter_doc.get_str("tier").unwrap(), "pro");

        let mut id = HashMap::new();
        id.insert("_id".into(), json!("507f1f77bcf86cd799439011"));
        let mut ch = HashMap::new();
        ch.insert("tier".into(), json!("enterprise"));

        let stmts = preview_mongo_mutations(&StagedBatchRequest {
            database: "saas".into(),
            schema: None,
            container: "accounts".into(),
            inserts: vec![json!({"name": "Acme"})],
            updates: vec![RecordUpdate {
                identity: id,
                changes: ch,
                original: HashMap::new(),
            }],
            deletes: vec![],
            atomic: true,
        })
        .unwrap();

        assert_eq!(stmts.len(), 2);
        assert!(stmts[0].starts_with("db.accounts.insertOne("));
        assert!(stmts[1].starts_with("db.accounts.updateOne("));
    }
}
