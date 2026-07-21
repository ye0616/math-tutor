"""积分商城 API 路由 — 教师管理商品 + 学生兑换 + 兑换记录 + 教师手动加分"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from database import get_db, add_points
from auth import get_user_from_token

router = APIRouter()


def _get_user(db, authorization: str):
    """用 JWT token 解析用户身份，再从数据库补充 class_id/points"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    uid = payload["user_id"]
    row = db.execute("SELECT id, role, class_id, points FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(401, "用户不存在")
    return {"id": row[0], "role": row[1], "class_id": row[2], "points": row[3] or 0}


# ═════════════════════════════════════
# 教师端 — 商品管理
# ═════════════════════════════════════

class StoreItemCreate(BaseModel):
    class_id: int
    name: str
    description: str = ""
    points: float
    stock: int = 0
    icon: str = "🎁"

@router.post("/items")
def create_item(req: StoreItemCreate, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")
        c = db.execute("INSERT INTO store_items (class_id,teacher_id,name,description,points,stock,icon) VALUES (?,?,?,?,?,?,?)",
                       (req.class_id, u["id"], req.name, req.description, req.points, req.stock, req.icon))
        return {"id": c.lastrowid}


@router.get("/items/{class_id}")
def list_items(class_id: int, authorization: str = Header(None)):
    with get_db() as db:
        _get_user(db, authorization)
        items = db.execute("SELECT id,name,description,points,stock,icon,status FROM store_items WHERE class_id=? AND status='active' ORDER BY created_at DESC", (class_id,)).fetchall()
        return {"items": [{"id": r[0], "name": r[1], "description": r[2], "points": r[3], "stock": r[4], "icon": r[5], "status": r[6]} for r in items]}


@router.put("/items/{item_id}")
def update_item(item_id: int, req: StoreItemCreate, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")
        db.execute("UPDATE store_items SET name=?,description=?,points=?,stock=?,icon=? WHERE id=? AND teacher_id=?",
                   (req.name, req.description, req.points, req.stock, req.icon, item_id, u["id"]))
        return {"ok": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")
        db.execute("UPDATE store_items SET status='inactive' WHERE id=? AND teacher_id=?", (item_id, u["id"]))
        return {"ok": True}


# ═════════════════════════════════════
# 学生端 — 兑换 + 我的记录
# ═════════════════════════════════════

@router.post("/redeem/{item_id}")
def redeem_item(item_id: int, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "student":
            raise HTTPException(403, "仅学生可操作")

        item = db.execute("SELECT id,name,points,stock,class_id FROM store_items WHERE id=? AND status='active'", (item_id,)).fetchone()
        if not item:
            raise HTTPException(404, "商品不存在或已下架")
        if item[3] is not None and item[3] <= 0:
            raise HTTPException(400, "商品库存不足")
        if u["points"] < item[2]:
            raise HTTPException(400, f"积分不足，需要{item[2]}分，当前{u['points']}分")
        if u["class_id"] != item[4]:
            raise HTTPException(403, "该商品不属于你的班级")

        # 扣积分 + 扣库存 + 创建兑换记录
        db.execute("UPDATE users SET points = points - ? WHERE id = ?", (item[2], u["id"]))
        if item[3] is not None and item[3] > 0:
            db.execute("UPDATE store_items SET stock = stock - 1 WHERE id = ?", (item_id,))
        db.execute("INSERT INTO redemptions (item_id,student_id,class_id,points,status) VALUES (?,?,?,?,'pending')",
                   (item_id, u["id"], u["class_id"], item[2]))

        new_points = db.execute("SELECT points FROM users WHERE id=?", (u["id"],)).fetchone()[0]
        return {"ok": True, "item_name": item[1], "points_spent": item[2], "remaining_points": new_points}


@router.get("/my-redemptions")
def my_redemptions(authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        rows = db.execute("""
            SELECT r.id, si.name, si.icon, r.points, r.status, r.teacher_note, r.created_at
            FROM redemptions r JOIN store_items si ON r.item_id = si.id
            WHERE r.student_id=? ORDER BY r.created_at DESC
        """, (u["id"],)).fetchall()
        return {"redemptions": [{"id": r[0], "item_name": r[1], "icon": r[2], "points": r[3], "status": r[4], "teacher_note": r[5], "created_at": str(r[6])} for r in rows]}


# ═════════════════════════════════════
# 教师端 — 兑换记录管理
# ═════════════════════════════════════

class RedemptionAction(BaseModel):
    status: str = "completed"  # completed / rejected
    note: str = ""

@router.put("/redemptions/{redemption_id}")
def update_redemption(redemption_id: int, req: RedemptionAction, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")
        db.execute("UPDATE redemptions SET status=?, teacher_note=? WHERE id=?",
                   (req.status, req.note, redemption_id))
        if req.status == "completed":
            from datetime import datetime
            db.execute("UPDATE redemptions SET delivered_at=? WHERE id=?", (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), redemption_id))
        return {"ok": True}


@router.get("/redemptions/{class_id}")
def list_redemptions(class_id: int, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")
        rows = db.execute("""
            SELECT r.id, si.name AS item_name, si.icon, us.name AS student_name,
                   r.points, r.status, r.teacher_note, r.created_at, r.delivered_at
            FROM redemptions r
            JOIN store_items si ON r.item_id = si.id
            JOIN users us ON r.student_id = us.id
            WHERE r.class_id=? ORDER BY r.created_at DESC LIMIT 100
        """, (class_id,)).fetchall()
        return {"redemptions": [
            {"id": r[0], "item_name": r[1], "icon": r[2], "student_name": r[3],
             "points": r[4], "status": r[5], "teacher_note": r[6] or "",
             "created_at": str(r[7]), "delivered_at": str(r[8]) if r[8] else ""}
            for r in rows
        ]}


# ═════════════════════════════════════
# 教师端 — 手动加分
# ═════════════════════════════════════

class ManualPointsRequest(BaseModel):
    student_id: int
    points: float
    reason: str = "教师手动加分"


@router.post("/teacher/add-points")
def teacher_add_points(req: ManualPointsRequest, authorization: str = Header(None)):
    """教师给学生手动加减积分"""
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")

        student = db.execute("SELECT id, name, class_id, points FROM users WHERE id=? AND role='student'", (req.student_id,)).fetchone()
        if not student:
            raise HTTPException(404, "学生不存在")

        # 验证学生属于教师的班级
        teacher_class = db.execute("SELECT id FROM classes WHERE teacher_id=?", (u["id"],)).fetchone()
        if not teacher_class or student["class_id"] != teacher_class["id"]:
            raise HTTPException(403, "该学生不在您的班级中")

        # 加减积分（正数加，负数减）
        add_points(db, req.student_id, req.points, f"教师手动加分-{req.reason}")

        new_points = db.execute("SELECT points FROM users WHERE id=?", (req.student_id,)).fetchone()[0]
        return {"ok": True, "student_name": student["name"], "points_added": req.points, "new_total": new_points}


@router.get("/teacher/students/{class_id}")
def list_class_students_for_points(class_id: int, authorization: str = Header(None)):
    """获取班级学生列表（用于教师加分选择）"""
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")
        rows = db.execute(
            "SELECT id, name, points, layer FROM users WHERE role='student' AND class_id=? ORDER BY points DESC",
            (class_id,),
        ).fetchall()
        return {"students": [{"id": r[0], "name": r[1], "points": r[2] or 0, "layer": r[3] or "basic"} for r in rows]}
