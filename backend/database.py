"""数据库初始化与连接"""

import sqlite3
import json
import hashlib
from contextlib import contextmanager
from config import DATABASE_PATH


def hash_password(password: str) -> str:
    """SHA256 密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


def get_connection():
    conn = sqlite3.connect(str(DATABASE_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def add_points(db, student_id: int, points: float, reason: str):
    """统一积分加减函数：更新 users.points + 记录 point_records"""
    db.execute("UPDATE users SET points = points + ? WHERE id=?", (points, student_id))
    db.execute(
        "INSERT INTO point_records (student_id, points, reason) VALUES (?, ?, ?)",
        (student_id, points, reason),
    )


def get_daily_points_by_reason_prefix(db, student_id: int, reason_prefix: str) -> float:
    """获取今日指定原因前缀的已获积分总和（用于每日封顶判断）"""
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    row = db.execute(
        "SELECT COALESCE(SUM(points), 0) as total FROM point_records "
        "WHERE student_id=? AND reason LIKE ? AND date(created_at)=?",
        (student_id, f"{reason_prefix}%", today),
    ).fetchone()
    return float(row["total"]) if row else 0.0


def init_db():
    """创建所有表结构"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        student_no TEXT DEFAULT '',
        password_hash TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        class_id INTEGER,
        avatar TEXT DEFAULT '',
        points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        teacher_id INTEGER REFERENCES users(id),
        class_code TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_code TEXT NOT NULL,
        type TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        content TEXT NOT NULL,
        answer TEXT NOT NULL,
        analysis TEXT,
        created_by TEXT DEFAULT 'ai',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER REFERENCES classes(id),
        teacher_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        unit_code TEXT DEFAULT '',
        type TEXT DEFAULT 'photo',
        source_image TEXT DEFAULT '',
        source_document TEXT DEFAULT '',
        questions_json TEXT DEFAULT '',
        answers_json TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        due_date DATETIME,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        question_id INTEGER REFERENCES questions(id),
        assignment_id INTEGER REFERENCES assignments(id),
        student_answer TEXT,
        is_correct INTEGER,
        score REAL,
        error_reason TEXT,
        ocr_image_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS error_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        question_id INTEGER REFERENCES questions(id),
        error_type TEXT,
        knowledge_gap TEXT,
        status TEXT DEFAULT 'unresolved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS point_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        points INTEGER NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        unit_code TEXT,
        content TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS preview_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER REFERENCES classes(id),
        teacher_id INTEGER REFERENCES users(id),
        lesson_code TEXT NOT NULL,
        lesson_title TEXT NOT NULL,
        unit_code TEXT NOT NULL,
        preview_content TEXT NOT NULL,
        inquiry_content TEXT,
        board_content TEXT,
        video_url TEXT DEFAULT '',
        status TEXT DEFAULT 'published',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS preview_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preview_task_id INTEGER REFERENCES preview_tasks(id),
        question_text TEXT NOT NULL,
        question_type TEXT DEFAULT 'fill',
        difficulty TEXT DEFAULT 'basic',
        options TEXT DEFAULT '',
        correct_answer TEXT NOT NULL,
        analysis TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS preview_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preview_question_id INTEGER REFERENCES preview_questions(id),
        preview_task_id INTEGER REFERENCES preview_tasks(id),
        student_id INTEGER REFERENCES users(id),
        student_answer TEXT,
        is_correct INTEGER,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS preview_watch_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preview_task_id INTEGER REFERENCES preview_tasks(id),
        student_id INTEGER REFERENCES users(id),
        layer TEXT NOT NULL,
        watch_duration INTEGER DEFAULT 0,
        total_duration INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        watched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 教师资源检索结果持久化：按「教师+课题」缓存检索结果，切页面回来仍在
    CREATE TABLE IF NOT EXISTS resource_search_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        lesson_title TEXT NOT NULL,
        grade TEXT DEFAULT '五年级',
        subject TEXT DEFAULT '数学',
        textbook_version TEXT DEFAULT '人教版',
        result_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 课堂教学结果持久化：按「教师+课时编码」缓存AI生成的完整教学数据，切页面回来仍在
    CREATE TABLE IF NOT EXISTS teach_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        lesson_code TEXT NOT NULL,
        lesson_title TEXT NOT NULL,
        unit_code TEXT DEFAULT '',
        result_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 教师备课资源收藏：可按层次（基础/提升/拓展）收藏资源，按课时分开存储
    CREATE TABLE IF NOT EXISTS teacher_resource_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        class_id INTEGER REFERENCES classes(id),
        lesson_code TEXT DEFAULT '',
        lesson_title TEXT DEFAULT '',
        layer TEXT NOT NULL DEFAULT 'basic',
        resource_type TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT DEFAULT '',
        embed_url TEXT DEFAULT '',
        platform TEXT DEFAULT '',
        description TEXT DEFAULT '',
        format TEXT DEFAULT '',
        size TEXT DEFAULT '',
        bvid TEXT DEFAULT '',
        match_score INTEGER DEFAULT 0,
        highlight TEXT DEFAULT '',
        is_ai_generated INTEGER DEFAULT 0,
        ai_content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 学生复习作业提交记录
    CREATE TABLE IF NOT EXISTS homework_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER REFERENCES assignments(id),
        student_id INTEGER REFERENCES users(id),
        lesson_title TEXT DEFAULT '',
        image_path TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        grading_json TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        total_questions INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    );

    -- 作业批改明细：每道题的批改结果
    CREATE TABLE IF NOT EXISTS homework_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER REFERENCES homework_submissions(id),
        student_id INTEGER REFERENCES users(id),
        question_index INTEGER DEFAULT 0,
        question_text TEXT NOT NULL,
        student_answer TEXT DEFAULT '',
        correct_answer TEXT DEFAULT '',
        is_correct INTEGER DEFAULT 0,
        analysis TEXT DEFAULT '',
        error_type TEXT DEFAULT '',
        correction_hint TEXT DEFAULT '',
        knowledge_point TEXT DEFAULT '',
        guided_correction_json TEXT DEFAULT '',
        similar_questions_json TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 闯关游戏记录
    CREATE TABLE IF NOT EXISTS challenge_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        unit_code TEXT DEFAULT '',
        lesson_code TEXT DEFAULT '',
        theme TEXT DEFAULT '',
        theme_intro TEXT DEFAULT '',
        questions_json TEXT DEFAULT '',
        answers_json TEXT DEFAULT '',
        total_questions INTEGER DEFAULT 0,
        total_correct INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    );

    -- 闯关答题明细
    CREATE TABLE IF NOT EXISTS challenge_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER REFERENCES challenge_sessions(id),
        student_id INTEGER REFERENCES users(id),
        level_index INTEGER DEFAULT 0,
        question_text TEXT DEFAULT '',
        student_answer TEXT DEFAULT '',
        correct_answer TEXT DEFAULT '',
        is_correct INTEGER DEFAULT 0,
        knowledge_point TEXT DEFAULT '',
        points_earned INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 课堂交互式探索提问保存
    CREATE TABLE IF NOT EXISTS teach_inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        lesson_code TEXT NOT NULL,
        lesson_title TEXT DEFAULT '',
        unit_code TEXT DEFAULT '',
        inquiry_json TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 学生班级排名历史（每周快照）
    CREATE TABLE IF NOT EXISTS student_rank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        class_id INTEGER REFERENCES classes(id),
        week_start TEXT NOT NULL,
        rank INTEGER NOT NULL,
        points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()

    # 迁移：为已有的 users 表补充新字段（兼容旧数据库）
    columns = [row[1] for row in cursor.execute("PRAGMA table_info(users)").fetchall()]
    if 'email' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")
    if 'phone' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''")
    if 'password_hash' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''")
    if 'status' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
    if 'class_id' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN class_id INTEGER")
    if 'student_no' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN student_no TEXT DEFAULT ''")

    # 迁移：为已有的 classes 表补充 class_code 字段
    class_columns = [row[1] for row in cursor.execute("PRAGMA table_info(classes)").fetchall()]
    if 'class_code' not in class_columns:
        cursor.execute("ALTER TABLE classes ADD COLUMN class_code TEXT")

    # 迁移：为 preview_tasks 表补充 layer_videos 字段
    pt_columns = [row[1] for row in cursor.execute("PRAGMA table_info(preview_tasks)").fetchall()]
    if 'layer_videos' not in pt_columns:
        cursor.execute("ALTER TABLE preview_tasks ADD COLUMN layer_videos TEXT DEFAULT ''")

    # 迁移：为 preview_questions 表补充 knowledge_point 字段
    pq_columns = [row[1] for row in cursor.execute("PRAGMA table_info(preview_questions)").fetchall()]
    if 'knowledge_point' not in pq_columns:
        cursor.execute("ALTER TABLE preview_questions ADD COLUMN knowledge_point TEXT DEFAULT ''")

    # 迁移：为 preview_tasks 表补充 material_json 字段（AI生成的结构化预习资料）
    if 'material_json' not in pt_columns:
        cursor.execute("ALTER TABLE preview_tasks ADD COLUMN material_json TEXT DEFAULT ''")

    # 迁移：为 teacher_resource_collections 表补充 highlight 字段（AI重点标注）
    trc_columns = [row[1] for row in cursor.execute("PRAGMA table_info(teacher_resource_collections)").fetchall()]
    if 'highlight' not in trc_columns:
        cursor.execute("ALTER TABLE teacher_resource_collections ADD COLUMN highlight TEXT DEFAULT ''")
    if 'is_ai_generated' not in trc_columns:
        cursor.execute("ALTER TABLE teacher_resource_collections ADD COLUMN is_ai_generated INTEGER DEFAULT 0")
    if 'ai_content' not in trc_columns:
        cursor.execute("ALTER TABLE teacher_resource_collections ADD COLUMN ai_content TEXT")
    if 'lesson_code' not in trc_columns:
        cursor.execute("ALTER TABLE teacher_resource_collections ADD COLUMN lesson_code TEXT DEFAULT ''")
    if 'lesson_title' not in trc_columns:
        cursor.execute("ALTER TABLE teacher_resource_collections ADD COLUMN lesson_title TEXT DEFAULT ''")

    # 迁移：为 users 表补充 layer 字段（学生分层：basic/advanced/extension）
    if 'layer' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN layer TEXT DEFAULT 'basic'")

    # 学生分层历史记录表
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS student_layer_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        class_id INTEGER REFERENCES classes(id),
        old_layer TEXT DEFAULT '',
        new_layer TEXT NOT NULL,
        source TEXT DEFAULT 'manual',
        exam_score REAL,
        remark TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 迁移：为 error_notes 表补充字段（支持作业批改来源的错题，不依赖 questions 表）
    en_columns = [row[1] for row in cursor.execute("PRAGMA table_info(error_notes)").fetchall()]
    if 'question_text' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN question_text TEXT DEFAULT ''")
    if 'student_answer' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN student_answer TEXT DEFAULT ''")
    if 'correct_answer' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN correct_answer TEXT DEFAULT ''")
    if 'analysis' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN analysis TEXT DEFAULT ''")
    if 'knowledge_point' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN knowledge_point TEXT DEFAULT ''")
    if 'source' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN source TEXT DEFAULT 'practice'")
    if 'image_path' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN image_path TEXT DEFAULT ''")
    if 'homework_question_id' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN homework_question_id INTEGER DEFAULT 0")
    if 'resolved_at' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN resolved_at DATETIME")
    if 'reheat_status' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN reheat_status TEXT DEFAULT 'none'")  # none/pending/reviewed
    if 'reheat_count' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN reheat_count INTEGER DEFAULT 0")
    if 'reheat_due' not in en_columns:
        cursor.execute("ALTER TABLE error_notes ADD COLUMN reheat_due DATE")  # 下次回炉到期日

    # 迁移：为 assignments 表补充教师作业管理相关字段
    assignment_cols = [row[1] for row in cursor.execute("PRAGMA table_info(assignments)").fetchall()]
    if 'teacher_id' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN teacher_id INTEGER")
    if 'description' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN description TEXT DEFAULT ''")
    if 'type' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN type TEXT DEFAULT 'photo'")
    if 'source_image' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN source_image TEXT DEFAULT ''")
    if 'source_document' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN source_document TEXT DEFAULT ''")
    if 'questions_json' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN questions_json TEXT DEFAULT ''")
    if 'answers_json' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN answers_json TEXT DEFAULT ''")
    if 'status' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN status TEXT DEFAULT 'draft'")
    if 'due_date' not in assignment_cols:
        cursor.execute("ALTER TABLE assignments ADD COLUMN due_date DATETIME")

    # 迁移：为 homework_submissions 表关联到 assignments
    hs_cols = [row[1] for row in cursor.execute("PRAGMA table_info(homework_submissions)").fetchall()]
    if 'assignment_id' not in hs_cols:
        cursor.execute("ALTER TABLE homework_submissions ADD COLUMN assignment_id INTEGER DEFAULT 0")

    # 迁移：为 questions 表补充 lesson_code 和 knowledge_point 字段
    q_cols = [row[1] for row in cursor.execute("PRAGMA table_info(questions)").fetchall()]
    if 'lesson_code' not in q_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN lesson_code TEXT DEFAULT ''")
    if 'knowledge_point' not in q_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN knowledge_point TEXT DEFAULT ''")

    # 积分商城商品表
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS store_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER REFERENCES classes(id),
        teacher_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        points INTEGER NOT NULL,
        stock INTEGER DEFAULT 0,
        icon TEXT DEFAULT '🎁',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER REFERENCES store_items(id),
        student_id INTEGER REFERENCES users(id),
        class_id INTEGER REFERENCES classes(id),
        points INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        teacher_note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME
    );
    """)

    # 考试/测验记录与成绩表
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER REFERENCES classes(id),
        teacher_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        unit_code TEXT DEFAULT '',
        source_image TEXT DEFAULT '',
        questions_json TEXT DEFAULT '',
        max_score REAL DEFAULT 100,
        exam_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER REFERENCES exams(id),
        student_id INTEGER REFERENCES users(id),
        score REAL DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        image_path TEXT DEFAULT '',
        detail_json TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 教师资源库：支持教师上传本地/地区资源，供同区县共享
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS teacher_resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        class_id INTEGER REFERENCES classes(id),
        region_tag TEXT DEFAULT '',
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        unit_code TEXT DEFAULT '',
        file_path TEXT DEFAULT '',
        content TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        is_favorite INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 教师个人资源库：教师手动上传的文件（历年真题、地区习题等）
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS resource_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        category TEXT DEFAULT '其他',
        grade TEXT DEFAULT '五年级',
        semester TEXT DEFAULT '',
        description TEXT DEFAULT '',
        file_path TEXT NOT NULL,
        file_name TEXT DEFAULT '',
        file_type TEXT DEFAULT '',
        file_size INTEGER DEFAULT 0,
        tags TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 随机考察结果表：作业全对后"再考考你"的随机题答题记录
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS random_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        class_id INTEGER,
        submission_id INTEGER REFERENCES homework_submissions(id),
        lesson_title TEXT DEFAULT '',
        questions_json TEXT DEFAULT '',
        answers_json TEXT DEFAULT '',
        total_questions INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        reported_to_teacher INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    );
    """)

    # 学习问答记录表：学生向AI提问的对话记录
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS study_qa_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        class_id INTEGER,
        question_text TEXT DEFAULT '',
        image_path TEXT DEFAULT '',
        conversation_json TEXT DEFAULT '',
        is_solved INTEGER DEFAULT 0,
        similar_question TEXT DEFAULT '',
        similar_answer TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
    );
    """)

    # 每日科普小知识表
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS daily_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        fun_fact TEXT DEFAULT '',
        category TEXT DEFAULT '',
        question TEXT DEFAULT '',
        options_json TEXT DEFAULT '',
        answer TEXT DEFAULT '',
        explanation TEXT DEFAULT '',
        fact_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_fact_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fact_id INTEGER REFERENCES daily_facts(id),
        student_id INTEGER REFERENCES users(id),
        answered_correctly INTEGER DEFAULT 0,
        points_earned REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fact_id, student_id)
    );
    """)

    # 趣味小游戏成绩记录表
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS mini_game_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        game_type TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        time_used INTEGER DEFAULT 0,
        detail_json TEXT DEFAULT '',
        points_earned REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()
    conn.close()


def seed_mock_data():
    """插入演示用Mock数据"""
    conn = get_connection()
    cursor = conn.cursor()

    # 检查是否已有数据
    if cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        conn.close()
        return

    # 管理员(id=1)
    cursor.execute(
        "INSERT INTO users (role, name, phone, password_hash, status, points) VALUES (?, ?, ?, ?, ?, ?)",
        ("admin", "系统管理员", "13800000001", hash_password("admin123"), "active", 0),
    )

    # 教师(id=2, 已审核通过)
    cursor.execute(
        "INSERT INTO users (role, name, phone, password_hash, status, points) VALUES (?, ?, ?, ?, ?, ?)",
        ("teacher", "王老师", "13800000002", hash_password("123456"), "approved", 0),
    )

    # 不预创建班级和学生——教师登录后自行创建班级、导入学生名单
    # 题目(Mock - 五上第一单元小数乘法)
    questions = [
        ("5A-U1-L1", "fill", "basic", "3.5 x 3 = ?", "10.5", "35x3=105, 一位小数, 结果10.5"),
        ("5A-U1-L1", "fill", "basic", "0.25 x 4 = ?", "1", "25x4=100, 两位小数, 结果1.00=1"),
        ("5A-U1-L1", "choice", "basic", "2.5 x 4 的结果是？ A.10 B.1 C.0.1 D.100", "A", "2.5x4=10"),
        ("5A-U1-L1", "application", "advanced", "小明买了3个蝴蝶风筝,每个3.5元,一共需要多少钱?", "10.5元", "3.5x3=10.5(元)"),
        ("5A-U1-L1", "fill", "advanced", "1.2 x 0.5 = ?", "0.6", "12x5=60, 两位小数, 结果0.60=0.6"),
        ("5A-U1-L1", "application", "extension", "一个长方形长1.25米,宽0.8米,面积是多少？如果给三面这样的墙刷漆,一共多少平方米?", "3平方米", "1.25x0.8=1(平方米), 1x3=3(平方米)"),
        ("5A-U1-L2", "fill", "basic", "6.7 x 100 = ?", "670", "小数点右移两位"),
        ("5A-U1-L2", "fill", "basic", "0.03 x 10 = ?", "0.3", "小数点右移一位"),
        ("5A-U1-L2", "choice", "advanced", "下列算式中,积大于3.5的是？ A.3.5x0.9 B.3.5x1.1 C.3.5x1 D.3.5x0.5", "B", "一个数乘大于1的数,积大于本身"),
        ("5A-U1-L2", "application", "extension", "一种钢材每根长1.5米,需要6根。如果每米重0.8千克,一共重多少千克?", "7.2千克", "1.5x6=9(米), 9x0.8=7.2(千克)"),
    ]
    for q in questions:
        cursor.execute(
            "INSERT INTO questions (unit_code, type, difficulty, content, answer, analysis) VALUES (?, ?, ?, ?, ?, ?)",
            q,
        )

    # 资源(Mock)
    cursor.execute(
        "INSERT INTO resources (title, type, unit_code, content) VALUES (?, ?, ?, ?)",
        ("五上第一单元 小数乘法 知识梳理", "lesson_plan", "5A-U1", json.dumps({"summary": "小数乘法单元教学要点"}, ensure_ascii=False)),
    )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    seed_mock_data()
    print("数据库初始化完成")
