"""认证与用户管理路由"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from database import get_db, hash_password
from auth import verify_password, create_token, get_user_from_token
from config import TEACHER_INVITE_CODE

router = APIRouter()


class RegisterRequest(BaseModel):
    role: str  # 'teacher' or 'student'
    name: str
    phone: str
    password: str
    invite_code: str | None = None  # 教师注册需要推荐码
    class_code: str | None = None  # 学生注册时可选的班级码


class LoginRequest(BaseModel):
    phone: str
    password: str
    role: str  # 'teacher', 'student', or 'admin'


class StudentLoginRequest(BaseModel):
    name: str
    student_no: str


@router.post("/register")
def register(req: RegisterRequest):
    """注册：教师需推荐码，学生由教师批量创建（不支持自注册）"""
    if req.role not in ("teacher", "student"):
        raise HTTPException(400, "角色必须是 teacher 或 student")

    # 学生不支持自注册，由教师批量导入
    if req.role == "student":
        raise HTTPException(403, "学生账号由教师统一创建，请联系老师获取账号")

    # 教师注册需要推荐码
    if not req.invite_code or req.invite_code.strip().upper() != TEACHER_INVITE_CODE.upper():
        raise HTTPException(403, "推荐码错误，请联系管理员获取教师推荐码")

    with get_db() as db:
        cursor = db.cursor()

        # 检查手机号是否已注册
        existing = cursor.execute("SELECT id FROM users WHERE phone = ?", (req.phone,)).fetchone()
        if existing:
            raise HTTPException(400, "该手机号已注册")

        # 学生注册：如果提供了班级码，查找对应班级
        class_id = None
        if req.role == "student" and req.class_code:
            cls = cursor.execute(
                "SELECT id FROM classes WHERE class_code = ?", (req.class_code.strip().upper(),)
            ).fetchone()
            if not cls:
                raise HTTPException(400, "班级码不存在")
            class_id = cls["id"]

        cursor.execute(
            "INSERT INTO users (role, name, phone, password_hash, status, points, class_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (req.role, req.name, req.phone, hash_password(req.password), "active", 0, class_id),
        )
        user_id = cursor.lastrowid

    return {
        "message": "注册成功，请登录" + ("，已加入班级" if class_id else ""),
        "user_id": user_id,
        "status": "active",
        "role": req.role,
        "class_id": class_id,
    }


@router.post("/login")
def login(req: LoginRequest):
    """登录：验证手机号密码 + 角色匹配 + 状态检查"""
    with get_db() as db:
        cursor = db.cursor()

        user = cursor.execute(
            "SELECT id, role, name, phone, student_no, password_hash, status, class_id, points FROM users WHERE phone = ?",
            (req.phone,),
        ).fetchone()

        if not user:
            raise HTTPException(401, "手机号未注册")

        if not verify_password(req.password, user["password_hash"]):
            raise HTTPException(401, "密码错误")

        if user["role"] != req.role:
            raise HTTPException(403, f"该账号是{user['role']}，请选择正确的登录入口")

        if user["status"] == "pending":
            raise HTTPException(403, "您的账号正在等待管理员审核，请耐心等待")
        elif user["status"] == "rejected":
            raise HTTPException(403, "您的注册申请未通过审核，请联系管理员")
        elif user["status"] not in ("active", "approved"):
            raise HTTPException(403, f"账号状态异常: {user['status']}")

        token = create_token(user["id"], user["role"], user["name"])

        return {
            "token": token,
            "user": {
                "id": user["id"],
                "role": user["role"],
                "name": user["name"],
                "phone": user["phone"],
                "student_no": user["student_no"],
                "class_id": user["class_id"],
                "points": user["points"],
            },
        }


@router.post("/student-login")
def student_login(req: StudentLoginRequest):
    """学生登录：姓名 + 学号（学号即密码）"""
    with get_db() as db:
        cursor = db.cursor()

        user = cursor.execute(
            "SELECT id, role, name, student_no, password_hash, status, class_id, points, layer FROM users WHERE name = ? AND student_no = ?",
            (req.name.strip(), req.student_no.strip()),
        ).fetchone()

        if not user:
            raise HTTPException(401, "姓名或学号错误")

        if user["role"] != "student":
            raise HTTPException(403, "该账号不是学生账号，请选择教师入口")

        if user["status"] not in ("active", "approved"):
            raise HTTPException(403, f"账号状态异常: {user['status']}")

        token = create_token(user["id"], user["role"], user["name"])

        return {
            "token": token,
            "user": {
                "id": user["id"],
                "role": user["role"],
                "name": user["name"],
                "student_no": user["student_no"],
                "class_id": user["class_id"],
                "points": user["points"],
                "layer": user["layer"] or "basic",
            },
        }


@router.get("/me")
def me(authorization: str = Header(None)):
    """获取当前登录用户信息"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")

    with get_db() as db:
        cursor = db.cursor()
        user = cursor.execute(
            "SELECT id, role, name, phone, student_no, status, class_id, points, avatar, layer FROM users WHERE id = ?",
            (payload["user_id"],),
        ).fetchone()

    if not user:
        raise HTTPException(404, "用户不存在")

    return dict(user)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    avatar: str | None = None


@router.put("/profile")
def update_profile(req: UpdateProfileRequest, authorization: str = Header(None)):
    """修改个人信息（支持修改姓名和头像）"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")

    with get_db() as db:
        cursor = db.cursor()
        if req.name:
            cursor.execute("UPDATE users SET name = ? WHERE id = ?", (req.name, payload["user_id"]))
        if req.avatar is not None:
            cursor.execute("UPDATE users SET avatar = ? WHERE id = ?", (req.avatar, payload["user_id"]))
        # 返回更新后的信息
        user = cursor.execute(
            "SELECT id, role, name, phone, student_no, status, class_id, points, avatar, layer FROM users WHERE id = ?",
            (payload["user_id"],),
        ).fetchone()

    if not user:
        raise HTTPException(404, "用户不存在")

    return {"message": "修改成功", "user": dict(user)}


@router.post("/change-password")
def change_password(req: ChangePasswordRequest, authorization: str = Header(None)):
    """修改密码"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")

    with get_db() as db:
        cursor = db.cursor()
        user = cursor.execute(
            "SELECT password_hash FROM users WHERE id = ?", (payload["user_id"],)
        ).fetchone()

        if not user:
            raise HTTPException(404, "用户不存在")

        if not verify_password(req.old_password, user["password_hash"]):
            raise HTTPException(400, "原密码错误")

        if len(req.new_password) < 6:
            raise HTTPException(400, "新密码至少6位")

        cursor.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(req.new_password), payload["user_id"]),
        )

    return {"message": "密码修改成功"}


# ===== 管理员接口 =====

@router.get("/admin/pending")
def list_pending(authorization: str = Header(None)):
    """获取待审核教师列表（仅管理员）"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload["role"] != "admin":
        raise HTTPException(403, "无权限，仅管理员可访问")

    with get_db() as db:
        cursor = db.cursor()
        rows = cursor.execute(
            "SELECT id, name, phone, role, status, created_at FROM users WHERE status = 'pending' ORDER BY created_at DESC"
        ).fetchall()

    return {"pending_list": [dict(r) for r in rows]}


@router.get("/admin/teachers")
def list_teachers(authorization: str = Header(None)):
    """获取所有教师列表（仅管理员）"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload["role"] != "admin":
        raise HTTPException(403, "无权限，仅管理员可访问")

    with get_db() as db:
        cursor = db.cursor()
        rows = cursor.execute(
            "SELECT id, name, phone, role, status, created_at FROM users WHERE role = 'teacher' ORDER BY created_at DESC"
        ).fetchall()

    return {"teachers": [dict(r) for r in rows]}


@router.post("/admin/approve/{user_id}")
def approve_teacher(user_id: int, authorization: str = Header(None)):
    """审核通过教师注册（仅管理员）"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload["role"] != "admin":
        raise HTTPException(403, "无权限，仅管理员可访问")

    with get_db() as db:
        cursor = db.cursor()

        user = cursor.execute("SELECT id, role, status FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "用户不存在")
        if user["role"] != "teacher":
            raise HTTPException(400, "该用户不是教师")
        if user["status"] != "pending":
            raise HTTPException(400, f"该教师状态为 {user['status']}，无需审核")

        cursor.execute("UPDATE users SET status = 'approved' WHERE id = ?", (user_id,))

    return {"message": "审核通过", "user_id": user_id}


@router.post("/admin/reject/{user_id}")
def reject_teacher(user_id: int, authorization: str = Header(None)):
    """驳回教师注册（仅管理员）"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload["role"] != "admin":
        raise HTTPException(403, "无权限，仅管理员可访问")

    with get_db() as db:
        cursor = db.cursor()

        user = cursor.execute("SELECT id, role, status FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "用户不存在")
        if user["role"] != "teacher":
            raise HTTPException(400, "该用户不是教师")
        if user["status"] != "pending":
            raise HTTPException(400, f"该教师状态为 {user['status']}，无需审核")

        cursor.execute("UPDATE users SET status = 'rejected' WHERE id = ?", (user_id,))

    return {"message": "已驳回", "user_id": user_id}
