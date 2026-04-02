use label_desktop::repo::job_repo::JobRepository;
use label_desktop::repo::template_repo::TemplateRepository;
use rusqlite::Connection;

fn open_test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
    label_desktop::db::run_migrations(&conn).expect("migrations should run");
    conn
}

#[test]
fn saves_template_and_job_records() {
    let db = open_test_db();
    let template_repo = TemplateRepository::new(&db);
    let job_repo = JobRepository::new(&db);

    let tpl_id = template_repo
        .save("demo", "{\"version\":2}")
        .expect("template should save");
    let job_id = job_repo
        .create(tpl_id, 10)
        .expect("job should save");

    assert!(job_id > 0);
}