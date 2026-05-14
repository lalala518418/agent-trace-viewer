from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Store SQLite under the backend folder so Windows local runs do not need extra services.
DATABASE_PATH = Path(__file__).resolve().parents[1] / "agent_trace_viewer.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def ensure_schema_columns() -> None:
    # MVP 阶段先用启动期补列，原因是 SQLite 本地学习成本低，也能兼容已有演示库文件。
    table_column_definitions = {
        "traces": {
            "execution_mode": "ALTER TABLE traces ADD COLUMN execution_mode VARCHAR(16) DEFAULT 'mock' NOT NULL",
            "provider": "ALTER TABLE traces ADD COLUMN provider VARCHAR(100) DEFAULT 'openai-compatible' NOT NULL",
            "model_name": "ALTER TABLE traces ADD COLUMN model_name VARCHAR(100) DEFAULT 'gpt-4.1-mini' NOT NULL",
            "prompt_version": "ALTER TABLE traces ADD COLUMN prompt_version VARCHAR(50) DEFAULT 'v0' NOT NULL",
            "replay_source_trace_id": "ALTER TABLE traces ADD COLUMN replay_source_trace_id VARCHAR(64)",
            "run_config_json": "ALTER TABLE traces ADD COLUMN run_config_json TEXT",
            "quality_label": "ALTER TABLE traces ADD COLUMN quality_label VARCHAR(32)",
            "quality_score": "ALTER TABLE traces ADD COLUMN quality_score FLOAT",
            "quality_notes": "ALTER TABLE traces ADD COLUMN quality_notes TEXT",
            "token_usage": "ALTER TABLE traces ADD COLUMN token_usage INTEGER DEFAULT 0 NOT NULL",
            "input_token_usage": "ALTER TABLE traces ADD COLUMN input_token_usage INTEGER DEFAULT 0 NOT NULL",
            "output_token_usage": "ALTER TABLE traces ADD COLUMN output_token_usage INTEGER DEFAULT 0 NOT NULL",
            "cached_token_usage": "ALTER TABLE traces ADD COLUMN cached_token_usage INTEGER DEFAULT 0 NOT NULL",
        },
        "evaluation_cases": {
            "ground_truth_type": "ALTER TABLE evaluation_cases ADD COLUMN ground_truth_type VARCHAR(32) DEFAULT 'keyword' NOT NULL",
            "judge_guidance": "ALTER TABLE evaluation_cases ADD COLUMN judge_guidance TEXT",
            "judge_config_json": "ALTER TABLE evaluation_cases ADD COLUMN judge_config_json TEXT",
        },
        "evaluation_runs": {
            "experiment_label": "ALTER TABLE evaluation_runs ADD COLUMN experiment_label VARCHAR(120)",
        },
        "evaluation_case_results": {
            "adjudication_label": "ALTER TABLE evaluation_case_results ADD COLUMN adjudication_label VARCHAR(32)",
            "adjudication_score": "ALTER TABLE evaluation_case_results ADD COLUMN adjudication_score FLOAT",
            "adjudication_notes": "ALTER TABLE evaluation_case_results ADD COLUMN adjudication_notes TEXT",
            "adjudicated_by": "ALTER TABLE evaluation_case_results ADD COLUMN adjudicated_by VARCHAR(100)",
            "adjudicated_at": "ALTER TABLE evaluation_case_results ADD COLUMN adjudicated_at DATETIME",
        },
        "evaluation_review_assignments": {
            "due_at": "ALTER TABLE evaluation_review_assignments ADD COLUMN due_at DATETIME",
        },
    }

    with engine.begin() as connection:
        for table_name, column_definitions in table_column_definitions.items():
            table_exists = connection.execute(
                text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
            ).first()
            if table_exists is None:
                continue

            existing_columns = {
                row[1]
                for row in connection.execute(text(f"PRAGMA table_info('{table_name}')"))
            }
            for column_name, ddl in column_definitions.items():
                if column_name not in existing_columns:
                    connection.execute(text(ddl))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()