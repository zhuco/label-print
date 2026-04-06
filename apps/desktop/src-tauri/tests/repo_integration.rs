use label_desktop::repo::job_repo::JobRepository;
use label_desktop::repo::template_repo::TemplateRepository;
use rusqlite::Connection;

fn open_test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
    label_desktop::db::run_migrations(&conn).expect("migrations should run");
    conn
}

#[test]
fn saves_template_and_job_metadata() {
    let db = open_test_db();
    let template_repo = TemplateRepository::new(&db);
    let job_repo = JobRepository::new(&db);

    let tpl_id = template_repo
        .save("demo", "{\"version\":2}")
        .expect("template should save");
    let job_id = job_repo
        .create_with_metadata(
            tpl_id,
            10,
            "printer-alpha",
            2,
            "{}",
            "{\"batch\":1}",
        )
        .expect("job should save");

    let job = job_repo.get(job_id).expect("job should exist");

    assert_eq!(job.template_id, tpl_id);
    assert_eq!(job.total_items, 10);
    assert_eq!(job.status, "queued");
    assert_eq!(job.printer_id, "printer-alpha");
    assert_eq!(job.copies, 2);
    assert_eq!(job.calibration_json, "{}");
    assert_eq!(job.payload_json, "{\"batch\":1}");
}

#[test]
fn auto_creates_template_when_missing_template_id_is_submitted() {
    let db = open_test_db();
    let template_repo = TemplateRepository::new(&db);
    let job_repo = JobRepository::new(&db);

    let job_id = job_repo
        .create_with_metadata(1, 3, "Microsoft Print to PDF", 1, "{}", "{\"batch\":2}")
        .expect("job should save even if template id is missing");
    let job = job_repo.get(job_id).expect("job should exist");

    assert!(job.template_id > 0);
    let templates = template_repo.list().expect("template list should load");
    assert!(!templates.is_empty());
    assert!(templates.iter().any(|tpl| tpl.id == job.template_id));
}
