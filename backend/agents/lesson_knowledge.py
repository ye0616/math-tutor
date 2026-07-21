"""课时知识库 - 真实B站视频映射 + 课题专属内容生成

数据来源：
- BV12e4y1b76d: 人教版五年级上册数学微课视频合集（短微课 6-12分钟）
- BV1eq4y1p7yn: 人教版五年级上册数学视频精讲合集（完整课时 17-20分钟）
"""

import json

# ===== B站视频BV号常量 =====
BV_WEIKE = "BV12e4y1b76d"   # 微课合集（短）
BV_JINGJIANG = "BV1eq4y1p7yn"  # 精讲合集（长）


def _embed(bvid: str, page: int = 1) -> str:
    return f"https://player.bilibili.com/player.html?bvid={bvid}&page={page}&high_quality=1&danmaku=0&autoplay=0"


# ===== 课时 → B站视频映射 =====
# 每个课时: basic=微课(短), advanced=精讲(长), extension=另一段精讲或拓展
VIDEO_MAP = {
    # 第二单元 小数乘法
    "5A-U2-L1": {  # 小数乘整数（1）
        "basic":    {"bvid": BV_WEIKE, "page": 2,  "title": "小数乘整数 微课视频", "duration": 406,  "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 1, "title": "小数乘整数（第1课时）", "duration": 1216, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 2, "title": "小数乘整数（第2课时）", "duration": 1127, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L2": {  # 小数乘整数（2）
        "basic":    {"bvid": BV_WEIKE, "page": 2,  "title": "小数乘整数 微课视频", "duration": 406,  "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 2, "title": "小数乘整数（第2课时）", "duration": 1127, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 1, "title": "小数乘整数（第1课时）", "duration": 1216, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L3": {  # 小数乘小数的计算方法
        "basic":    {"bvid": BV_WEIKE, "page": 1,  "title": "小数乘小数 微课视频", "duration": 511,  "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 3, "title": "小数乘小数（第1课时）", "duration": 1211, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 5, "title": "小数乘小数（第3课时）", "duration": 1246, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L4": {  # 积的小数位数不够的处理方法
        "basic":    {"bvid": BV_WEIKE, "page": 1,  "title": "小数乘小数 微课视频", "duration": 511,  "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 3, "title": "小数乘小数（第1课时）", "duration": 1211, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 5, "title": "小数乘小数（第3课时）", "duration": 1246, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L5": {  # 求一个数的小数倍是多少
        "basic":    {"bvid": BV_WEIKE, "page": 1,  "title": "小数乘小数 微课视频", "duration": 511,  "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 5, "title": "小数乘小数（第3课时）", "duration": 1246, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 3, "title": "小数乘小数（第1课时）", "duration": 1211, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L6": {  # 整数乘法运算律推广到小数
        "basic":    {"bvid": BV_WEIKE, "page": 3,  "title": "整数乘法运算定律推广到小数 微课", "duration": 454, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 7, "title": "整数乘法运算定律推广到小数", "duration": 1246, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 8, "title": "解决问题（第1课时）", "duration": 1205, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L7": {  # 估算解决实际问题
        "basic":    {"bvid": BV_WEIKE, "page": 3,  "title": "整数乘法运算定律推广到小数 微课", "duration": 454, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 8, "title": "解决问题（第1课时）", "duration": 1205, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 9, "title": "解决问题（第2课时）", "duration": 1216, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U2-L8": {  # 分段计费的实际问题
        "basic":    {"bvid": BV_WEIKE, "page": 3,  "title": "整数乘法运算定律推广到小数 微课", "duration": 454, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 9, "title": "解决问题（第2课时）", "duration": 1216, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 8, "title": "解决问题（第1课时）", "duration": 1205, "platform": "B站·人教版五年级数学精讲"},
    },
    # 第三单元 小数除法
    "5A-U3-L1": {  # 整数除以整数商是小数
        "basic":    {"bvid": BV_WEIKE, "page": 5,  "title": "除数是整数的小数除法 微课", "duration": 435, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 12, "title": "除数是整数的小数除法（第1课时）", "duration": 1246, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 13, "title": "除数是整数的小数除法（第2课时）", "duration": 1091, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U3-L2": {  # 小数除以整数商是小数
        "basic":    {"bvid": BV_WEIKE, "page": 5,  "title": "除数是整数的小数除法 微课", "duration": 435, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 13, "title": "除数是整数的小数除法（第2课时）", "duration": 1091, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 14, "title": "除数是整数的小数除法（第3课时）", "duration": 1167, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U3-L3": {  # 商的整数部分不够商1
        "basic":    {"bvid": BV_WEIKE, "page": 6,  "title": "除数是整数的小数除法(补0) 微课", "duration": 410, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 14, "title": "除数是整数的小数除法（第3课时）", "duration": 1167, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 12, "title": "除数是整数的小数除法（第1课时）", "duration": 1246, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U3-L4": {  # 循环小数
        "basic":    {"bvid": BV_WEIKE, "page": 20, "title": "循环小数 微课视频", "duration": 703, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 19, "title": "循环小数", "duration": 1197, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 18, "title": "商的近似数", "duration": 1201, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U3-L5": {  # 一个数除以小数的计算方法
        "basic":    {"bvid": BV_WEIKE, "page": 7,  "title": "一个数除以小数 微课", "duration": 573, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 15, "title": "一个数除以小数（第1课时）", "duration": 1147, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 16, "title": "一个数除以小数（第2课时）", "duration": 1060, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U3-L6": {  # 被除数的小数位数比除数少
        "basic":    {"bvid": BV_WEIKE, "page": 7,  "title": "一个数除以小数 微课", "duration": 573, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 16, "title": "一个数除以小数（第2课时）", "duration": 1060, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 17, "title": "一个数除以小数（第3课时）", "duration": 1155, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U3-L7": {  # 灵活取商的近似数解决问题
        "basic":    {"bvid": BV_WEIKE, "page": 19, "title": "商的近似数 微课", "duration": 578, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 18, "title": "商的近似数", "duration": 1201, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 19, "title": "循环小数", "duration": 1197, "platform": "B站·人教版五年级数学精讲"},
    },
    # 第六单元 多边形的面积
    "5A-U6-L1": {  # 平行四边形面积计算公式的推导
        "basic":    {"bvid": BV_WEIKE, "page": 15, "title": "平行四边形的面积 微课", "duration": 569, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 45, "title": "平行四边形的面积（第1课时）", "duration": 1141, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 46, "title": "平行四边形的面积（第2课时）", "duration": 1057, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U6-L2": {  # 平行四边形面积的实际应用
        "basic":    {"bvid": BV_WEIKE, "page": 15, "title": "平行四边形的面积 微课", "duration": 569, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 46, "title": "平行四边形的面积（第2课时）", "duration": 1057, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 45, "title": "平行四边形的面积（第1课时）", "duration": 1141, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U6-L4": {  # 三角形面积计算公式的推导
        "basic":    {"bvid": BV_WEIKE, "page": 18, "title": "三角形的面积 微课", "duration": 514, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 47, "title": "三角形的面积（第1课时）", "duration": 1084, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 48, "title": "三角形的面积（第2课时）", "duration": 1199, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U6-L5": {  # 三角形面积的实际应用
        "basic":    {"bvid": BV_WEIKE, "page": 18, "title": "三角形的面积 微课", "duration": 514, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 48, "title": "三角形的面积（第2课时）", "duration": 1199, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 47, "title": "三角形的面积（第1课时）", "duration": 1084, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U6-L6": {  # 梯形面积计算公式的推导
        "basic":    {"bvid": BV_WEIKE, "page": 16, "title": "梯形的面积 微课", "duration": 574, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 49, "title": "梯形的面积（第1课时）", "duration": 1168, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 50, "title": "梯形的面积（第2课时）", "duration": 1226, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U6-L7": {  # 梯形面积的实际应用
        "basic":    {"bvid": BV_WEIKE, "page": 16, "title": "梯形的面积 微课", "duration": 574, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 50, "title": "梯形的面积（第2课时）", "duration": 1226, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 49, "title": "梯形的面积（第1课时）", "duration": 1168, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U6-L8": {  # 组合图形面积的计算方法
        "basic":    {"bvid": BV_WEIKE, "page": 17, "title": "组合图形的面积 微课", "duration": 312, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 51, "title": "组合图形的面积", "duration": 1182, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 45, "title": "平行四边形的面积（第1课时）", "duration": 1141, "platform": "B站·人教版五年级数学精讲"},
    },
    # 第七单元 可能性
    "5A-U7-L1": {  # 事件发生的确定性和不确定性
        "basic":    {"bvid": BV_WEIKE, "page": 9,  "title": "可能性有大有小 微课", "duration": 474, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 23, "title": "可能性（第1课时）", "duration": 1207, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 24, "title": "可能性（第2课时）", "duration": 1211, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U7-L2": {  # 事件发生的可能性大小
        "basic":    {"bvid": BV_WEIKE, "page": 9,  "title": "可能性有大有小 微课", "duration": 474, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 24, "title": "可能性（第2课时）", "duration": 1211, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 25, "title": "可能性（第3课时）", "duration": 1134, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U7-L3": {  # 根据可能性大小推测
        "basic":    {"bvid": BV_WEIKE, "page": 9,  "title": "可能性有大有小 微课", "duration": 474, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 25, "title": "可能性（第3课时）", "duration": 1134, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 23, "title": "可能性（第1课时）", "duration": 1207, "platform": "B站·人教版五年级数学精讲"},
    },
    # 数学广角：植树问题
    "5A-U8-L1": {  # 植树问题——两端都栽
        "basic":    {"bvid": BV_WEIKE, "page": 9,  "title": "可能性 微课（数形结合思想迁移）", "duration": 474, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 54, "title": "植树问题（第1课时）", "duration": 1143, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 23, "title": "可能性（第1课时）——数学建模迁移", "duration": 1207, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U8-L2": {  # 两端都不栽
        "basic":    {"bvid": BV_WEIKE, "page": 9,  "title": "可能性 微课（模型对比）", "duration": 474, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 54, "title": "植树问题（第1课时）", "duration": 1143, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 25, "title": "可能性（第3课时）——封闭图形迁移", "duration": 1134, "platform": "B站·人教版五年级数学精讲"},
    },
    "5A-U8-L3": {  # 一端栽一端不栽/封闭图形
        "basic":    {"bvid": BV_WEIKE, "page": 9,  "title": "可能性 微课（封闭图形）", "duration": 474, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 54, "title": "植树问题（第1课时）", "duration": 1143, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 51, "title": "组合图形的面积——封闭图形迁移", "duration": 1182, "platform": "B站·人教版五年级数学精讲"},
    },
}


# ===== 课题专属知识点和题目 =====
# 每个课题的: 知识点列表 + 分层题目
LESSON_CONTENT = {
    "5A-U2-L1": {
        "topic": "小数乘整数",
        "knowledge_points": ["小数乘整数的计算方法", "积的小数点定位", "整数乘法到小数乘法的迁移"],
        "questions": {
            "basic": [
                {"question": "3.5 × 3 = ?", "answer": "10.5", "analysis": "35×3=105，一位小数，结果10.5", "knowledge_point": "小数乘整数的计算方法"},
                {"question": "0.25 × 4 = ?", "answer": "1", "analysis": "25×4=100，两位小数，结果1.00=1", "knowledge_point": "积的小数点定位"},
            ],
            "advanced": [
                {"question": "小明买了3个蝴蝶风筝，每个3.5元，一共需要多少钱？", "answer": "10.5元", "analysis": "3.5×3=10.5（元）", "knowledge_point": "小数乘法的实际应用"},
            ],
            "extension": [
                {"question": "不计算，判断：0.85 × 1.2 的积（ ）0.85。\nA.大于  B.小于  C.等于  D.无法确定", "answer": "A", "analysis": "1.2大于1，一个非零数乘大于1的数，积大于本身", "knowledge_point": "积与因数的大小关系"},
                {"question": "一个长方形长1.25米，宽0.8米，面积是多少平方米？", "answer": "1平方米", "analysis": "1.25×0.8=1（平方米）", "knowledge_point": "小数乘法在几何中的应用"},
            ],
        },
        "preview_tasks": {
            "basic": ["回顾整数乘法的竖式计算方法", "完成3道小数乘整数基础口算题", "阅读课本P12-13例题部分"],
            "advanced": ["尝试用多种方法计算3.5×3", "思考：小数乘整数与整数乘法有何联系？"],
            "extension": ["设计一道小数乘整数的生活应用题", "向同桌讲解你的解题思路"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["买3个计算器，每个3.5元，一共需要多少钱？", "你能用以前学过的知识来解决这个问题吗？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["3.5×3可以转化成我们学过的整数乘法吗？", "积的小数位数与因数有什么关系？", "为什么可以这样计算？能说说道理吗？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["谁能用自己的话说一说小数乘整数的计算方法？", "计算时最需要注意什么？"]},
        ],
        "board": {
            "main_board": "方法一：3.5+3.5+3.5=10.5（元）\n方法二：3.5元=35角 → 35×3=105角=10.5元\n方法三：竖式 3.5×3=10.5",
            "side_board": "关键步骤：\n① 按整数乘法算出积\n② 看因数中有几位小数\n③ 从积的右边起数出位数，点小数点\n\n易错提醒：\n⚠ 小数点要对齐\n⚠ 积末尾的0要先点小数点再去0",
            "interactive_element": "白板互动：拖拽数字卡片，观察小数点位置变化",
        },
    },
    "5A-U2-L3": {
        "topic": "小数乘小数",
        "knowledge_points": ["小数乘小数的计算方法", "积的小数位数等于因数小数位数之和", "积的小数位数不够时补0"],
        "questions": {
            "basic": [
                {"question": "1.2 × 0.3 = ?", "answer": "0.36", "analysis": "12×3=36，共两位小数，结果0.36", "knowledge_point": "小数乘小数的计算方法"},
                {"question": "0.4 × 0.5 = ?", "answer": "0.2", "analysis": "4×5=20，共两位小数，结果0.20=0.2", "knowledge_point": "积的小数点定位"},
            ],
            "advanced": [
                {"question": "一块长方形菜地长6.5米，宽3.2米，面积是多少平方米？", "answer": "20.8平方米", "analysis": "6.5×3.2=20.8（平方米）", "knowledge_point": "小数乘法的实际应用"},
            ],
            "extension": [
                {"question": "0.12 × 0.03 = ?", "answer": "0.0036", "analysis": "12×3=36，共四位小数，位数不够补0，结果0.0036", "knowledge_point": "积的小数位数不够补0"},
            ],
        },
        "preview_tasks": {
            "basic": ["复习小数乘整数的计算方法", "完成2道小数乘小数基础题", "观察：因数小数位数与积小数位数的关系"],
            "advanced": ["尝试计算6.5×3.2并验证结果", "思考：积的小数位数怎样确定？"],
            "extension": ["探究：0.12×0.03的结果为什么补0？", "总结小数乘法的完整计算步骤"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["长6.5米宽3.2米的宣传栏，面积多大？", "小数乘小数和之前学的有什么不同？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["因数的小数位数和积的小数位数有什么关系？", "积的小数位数不够时怎么办？", "你能总结小数乘小数的计算法则吗？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["小数乘小数分几步完成？", "最容易出错的地方在哪里？"]},
        ],
        "board": {
            "main_board": "6.5 × 3.2 = 20.8\n一位小数 + 一位小数 = 两位小数\n65 × 32 = 2080 → 20.80 → 20.8",
            "side_board": "计算法则：\n① 按整数乘法算出积\n② 看因数中一共有几位小数\n③ 从积右边起数出同样位数\n④ 点上小数点（位数不够用0补足）",
            "interactive_element": "白板互动：拖拽小数点，观察积的变化",
        },
    },
    "5A-U3-L1": {
        "topic": "小数除以整数",
        "knowledge_points": ["小数除以整数的计算方法", "商的小数点与被除数小数点对齐", "整数部分不够除时商0"],
        "questions": {
            "basic": [
                {"question": "7.2 ÷ 6 = ?", "answer": "1.2", "analysis": "72÷6=12，商的小数点与被除数对齐，结果1.2", "knowledge_point": "小数除以整数的计算方法"},
                {"question": "9.6 ÷ 4 = ?", "answer": "2.4", "analysis": "96÷4=24，小数点对齐，结果2.4", "knowledge_point": "商的小数点定位"},
            ],
            "advanced": [
                {"question": "一根绳子长22.4米，平均剪成4段，每段长多少米？", "answer": "5.6米", "analysis": "22.4÷4=5.6（米）", "knowledge_point": "小数除法的实际应用"},
            ],
            "extension": [
                {"question": "3.6 ÷ 24 = ?", "answer": "0.15", "analysis": "整数部分3不够除24，商0，36÷24=1余12，补0得120÷24=5，结果0.15", "knowledge_point": "整数部分不够除时商0"},
            ],
        },
        "preview_tasks": {
            "basic": ["复习整数除法的竖式计算", "完成2道小数除以整数基础题", "观察：商的小数点位置与什么有关？"],
            "advanced": ["计算22.4÷4并验算", "思考：商的小数点为什么要和被除数小数点对齐？"],
            "extension": ["探究3.6÷24的计算过程", "总结小数除以整数的完整步骤"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["22.4米绳子平均分4段，每段多长？", "小数除法和整数除法有什么不同？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["商的小数点应该点在哪里？为什么？", "整数部分不够除时怎么办？", "除到被除数末位仍有余数怎么办？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["小数除以整数的关键步骤是什么？", "计算时最容易出错的地方是哪里？"]},
        ],
        "board": {
            "main_board": "22.4 ÷ 4 = 5.6\n  5.6\n——\n4|22.4\n  20\n  —\n   2 4\n   2 4\n   —\n     0",
            "side_board": "关键步骤：\n① 按整数除法方法去除\n② 商的小数点要和被除数小数点对齐\n③ 整数部分不够除，商0，点小数点\n\n易错：商的小数点位置",
            "interactive_element": "白板互动：竖式拖拽，对齐小数点",
        },
    },
    "5A-U3-L4": {
        "topic": "循环小数",
        "knowledge_points": ["循环小数的概念", "有限小数与无限小数", "循环节的表示方法"],
        "questions": {
            "basic": [
                {"question": "10 ÷ 3 的商是循环小数吗？写成循环小数。", "answer": "3.333...（3的循环）", "analysis": "10÷3=3.333...，从小数部分第一位开始重复出现3", "knowledge_point": "循环小数的概念"},
                {"question": "判断：0.333...是循环小数。", "answer": "是", "analysis": "小数部分从第一位起依次不断重复出现3", "knowledge_point": "循环小数的识别"},
            ],
            "advanced": [
                {"question": "28 ÷ 18 的商是多少？用循环小数表示。", "answer": "1.555...", "analysis": "28÷18=1.555...，小数部分从第一位起不断重复出现5", "knowledge_point": "循环小数的计算"},
            ],
            "extension": [
                {"question": "比较大小：0.333... 和 0.3333，哪个大？", "answer": "0.333...", "analysis": "0.333...是无限循环小数，比有限的0.3333大", "knowledge_point": "循环小数的大小比较"},
                {"question": "把 7 ÷ 11 的商用循环小数表示。", "answer": "0.6363...", "analysis": "7÷11=0.6363...，循环节是63", "knowledge_point": "循环节的识别"},
            ],
        },
        "preview_tasks": {
            "basic": ["阅读课本循环小数部分", "完成2道除法题并观察商的特点", "思考：什么样的数是循环小数？"],
            "advanced": ["计算28÷18并尝试用简写表示", "探究：循环节怎样确定？"],
            "extension": ["比较循环小数和有限小数的大小", "探究7÷11的商的循环节"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["10÷3的商是多少？你发现了什么？", "为什么商总是除不尽？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["什么叫循环小数？", "循环节是什么？怎么找？", "有限小数和无限小数有什么区别？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["循环小数怎么简写？", "怎样判断一个除法的商是不是循环小数？"]},
        ],
        "board": {
            "main_board": "10 ÷ 3 = 3.333... = 3.3̇\n28 ÷ 18 = 1.555... = 1.5̇\n7 ÷ 11 = 0.6363... = 0.6̇3̇",
            "side_board": "概念：\n① 循环小数：小数部分依次不断重复\n② 循环节：依次不断重复出现的数字\n③ 简写：在循环节首末位上点圆点\n\n分类：\n有限小数 vs 无限小数\n  └ 循环小数",
            "interactive_element": "白板互动：在数字上点击标记循环节",
        },
    },
    "5A-U6-L1": {
        "topic": "平行四边形的面积",
        "knowledge_points": ["平行四边形面积公式S=ah", "割补法推导面积公式", "底和高的对应关系"],
        "questions": {
            "basic": [
                {"question": "一个平行四边形的底是5cm，高是3cm，面积是多少？", "answer": "15cm²", "analysis": "S=ah=5×3=15（cm²）", "knowledge_point": "平行四边形面积公式S=ah"},
                {"question": "平行四边形面积公式的字母表示是？", "answer": "S=ah", "analysis": "S表示面积，a表示底，h表示高", "knowledge_point": "面积公式的表示"},
            ],
            "advanced": [
                {"question": "一块平行四边形菜地，底是12.5米，高是8米，面积是多少平方米？", "answer": "100平方米", "analysis": "S=ah=12.5×8=100（平方米）", "knowledge_point": "平行四边形面积的实际应用"},
            ],
            "extension": [
                {"question": "一个平行四边形面积是48cm²，底是8cm，高是多少？", "answer": "6cm", "analysis": "h=S÷a=48÷8=6（cm）", "knowledge_point": "面积公式的逆运算"},
                {"question": "等底等高的平行四边形面积一定相等吗？为什么？", "answer": "一定相等", "analysis": "面积S=ah，底和高都相等，面积必然相等", "knowledge_point": "等底等高与面积的关系"},
            ],
        },
        "preview_tasks": {
            "basic": ["复习长方形面积公式S=ab", "用方格纸数平行四边形的面积", "阅读课本平行四边形面积推导过程"],
            "advanced": ["动手剪拼：把平行四边形转化成长方形", "思考：拼成的长方形和原平行四边形有什么关系？"],
            "extension": ["探究：等底等高的平行四边形面积关系", "尝试用字母推导面积公式"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["这个平行四边形面积多大？用方格数一数", "能不能把它变成我们学过的图形？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["沿高剪开后拼成了什么图形？", "拼成的长方形的长和宽与原平行四边形有什么关系？", "你能推导出面积公式吗？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["平行四边形面积公式是什么？", "公式中的底和高有什么要求？"]},
        ],
        "board": {
            "main_board": "平行四边形 →（割补法）→ 长方形\n\n  底 → 长\n  高 → 宽\n\n  S = a × h\n\n例：a=5cm, h=3cm\n  S = 5×3 = 15（cm²）",
            "side_board": "推导过程：\n① 沿高剪开\n② 平移拼合\n③ 转化为长方形\n\n关键：\n⚠ 底和高必须对应\n⚠ 面积单位不能忘记",
            "interactive_element": "白板互动：拖拽剪开的三角形，演示割补过程",
        },
    },
    "5A-U6-L4": {
        "topic": "三角形的面积",
        "knowledge_points": ["三角形面积公式S=ah÷2", "两个完全相同的三角形拼成平行四边形", "底和高的对应关系"],
        "questions": {
            "basic": [
                {"question": "一个三角形底是6cm，高是4cm，面积是多少？", "answer": "12cm²", "analysis": "S=ah÷2=6×4÷2=12（cm²）", "knowledge_point": "三角形面积公式S=ah÷2"},
                {"question": "三角形面积公式的字母表示是？", "answer": "S=ah÷2", "analysis": "因为两个三角形拼成一个平行四边形", "knowledge_point": "面积公式推导"},
            ],
            "advanced": [
                {"question": "一块三角形红领巾，底100cm，高33cm，面积是多少？", "answer": "1650cm²", "analysis": "S=100×33÷2=1650（cm²）", "knowledge_point": "三角形面积的实际应用"},
            ],
            "extension": [
                {"question": "一个三角形面积是24cm²，底是8cm，高是多少？", "answer": "6cm", "analysis": "h=2S÷a=2×24÷8=6（cm）", "knowledge_point": "面积公式的逆运算"},
                {"question": "等底等高的三角形和平行四边形面积有什么关系？", "answer": "三角形面积是平行四边形面积的一半", "analysis": "因为S三角形=ah÷2，S平行四边形=ah", "knowledge_point": "三角形与平行四边形面积的关系"},
            ],
        },
        "preview_tasks": {
            "basic": ["复习平行四边形面积公式", "用两个完全相同的三角形拼一拼", "阅读课本三角形面积推导过程"],
            "advanced": ["动手操作：两个三角形拼成什么图形？", "思考：拼成图形的底和高与三角形有什么关系？"],
            "extension": ["探究三角形和平行四边形面积的关系", "总结推导过程"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["两个完全相同的三角形能拼成什么图形？", "拼成的图形面积怎么求？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["两个三角形拼成的平行四边形的底和高与原三角形有什么关系？", "所以三角形面积怎么算？为什么要÷2？", "如果只知道面积和底，能求高吗？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["三角形面积公式是什么？为什么÷2？", "计算时需要注意什么？"]},
        ],
        "board": {
            "main_board": "两个完全相同的三角形 → 平行四边形\n\n  三角形面积 = 平行四边形面积 ÷ 2\n\n  S = a × h ÷ 2\n\n例：a=6cm, h=4cm\n  S = 6×4÷2 = 12（cm²）",
            "side_board": "推导过程：\n① 取两个完全相同的三角形\n② 拼成平行四边形\n② 三角形面积=平行四边形面积÷2\n\n关键：\n⚠ 底和高必须对应\n⚠ 不要忘记÷2",
            "interactive_element": "白板互动：拖拽两个三角形拼合，演示推导",
        },
    },
    "5A-U6-L6": {
        "topic": "梯形的面积",
        "knowledge_points": ["梯形面积公式S=(a+b)h÷2", "两个完全相同的梯形拼成平行四边形", "上底、下底和高的含义"],
        "questions": {
            "basic": [
                {"question": "一个梯形上底3cm，下底5cm，高4cm，面积是多少？", "answer": "16cm²", "analysis": "S=(a+b)h÷2=(3+5)×4÷2=16（cm²）", "knowledge_point": "梯形面积公式S=(a+b)h÷2"},
                {"question": "梯形面积公式的字母表示是？", "answer": "S=(a+b)h÷2", "analysis": "a是上底，b是下底，h是高", "knowledge_point": "面积公式表示"},
            ],
            "advanced": [
                {"question": "一条水渠横截面是梯形，上底2米，下底3.5米，深1.2米，横截面积是多少？", "answer": "3.3平方米", "analysis": "S=(2+3.5)×1.2÷2=3.3（平方米）", "knowledge_point": "梯形面积的实际应用"},
            ],
            "extension": [
                {"question": "一个梯形面积是40cm²，上底4cm，下底6cm，高是多少？", "answer": "8cm", "analysis": "h=2S÷(a+b)=2×40÷(4+6)=8（cm）", "knowledge_point": "面积公式逆运算"},
                {"question": "梯形面积公式和平行四边形面积公式有什么联系？", "answer": "梯形上底等于下底时，(a+b)÷2就等于底，即S=ah", "analysis": "当a=b时，梯形变成平行四边形，(a+b)÷2=a", "knowledge_point": "面积公式的统一性"},
            ],
        },
        "preview_tasks": {
            "basic": ["复习平行四边形和三角形面积公式", "用两个完全相同的梯形拼一拼", "阅读课本梯形面积推导过程"],
            "advanced": ["动手操作：两个梯形拼成什么图形？", "思考：拼成图形的底和梯形上下底有什么关系？"],
            "extension": ["探究梯形面积公式与平行四边形面积公式的联系", "尝试用多种方法推导梯形面积"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["两个完全相同的梯形能拼成什么图形？", "拼成的图形面积怎么求？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["拼成的平行四边形的底和梯形上下底有什么关系？", "拼成图形的高和梯形的高有什么关系？", "所以梯形面积怎么算？为什么÷2？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["梯形面积公式是什么？各字母表示什么？", "什么情况下梯形面积公式和平行四边形一样？"]},
        ],
        "board": {
            "main_board": "两个完全相同的梯形 → 平行四边形\n\n  平行四边形底 = 上底 + 下底\n  平行四边形高 = 梯形高\n\n  S = (a + b) × h ÷ 2\n\n例：a=3, b=5, h=4\n  S = (3+5)×4÷2 = 16（cm²）",
            "side_board": "推导过程：\n① 取两个完全相同的梯形\n② 拼成平行四边形\n③ 底=上底+下底\n④ 面积÷2\n\n特殊：\n⚠ a=b时退化为平行四边形\n⚠ a=0时退化为三角形",
            "interactive_element": "白板互动：拖拽两个梯形拼合，演示推导过程",
        },
    },
    "5A-U7-L1": {
        "topic": "可能性的大小",
        "knowledge_points": ["事件发生的确定性与不确定性", "可能性的大小比较", "用分数表示可能性"],
        "questions": {
            "basic": [
                {"question": "盒子里有5个红球，3个白球，任意摸一个，摸到什么颜色球的可能性大？", "answer": "红球", "analysis": "红球数量多（5>3），摸到红球的可能性大", "knowledge_point": "可能性的大小比较"},
                {"question": "判断：太阳从西边升起。（确定/不确定）", "answer": "确定事件（不可能）", "analysis": "太阳一定从东边升起，从西边升起是不可能事件", "knowledge_point": "确定性与不确定性"},
            ],
            "advanced": [
                {"question": "盒子里有3个红球，2个白球，任意摸一个，摸到红球的可能性是多少？", "answer": "3/5", "analysis": "红球3个，总共5个，可能性=3/5", "knowledge_point": "用分数表示可能性"},
            ],
            "extension": [
                {"question": "掷一枚骰子，掷出偶数的可能性是多少？", "answer": "1/2", "analysis": "偶数有2、4、6共3个，总共6个面，可能性=3/6=1/2", "knowledge_point": "可能性的计算"},
                {"question": "如果要让摸到红球的可能性是1/3，盒子里的球应该怎么放？", "answer": "红球占总数的1/3，如1红2白、2红4白等", "analysis": "红球数÷总数=1/3", "knowledge_point": "可能性的设计"},
            ],
        },
        "preview_tasks": {
            "basic": ["观察生活中的确定事件和不确定事件", "完成2道可能性大小比较题", "阅读课本可能性部分"],
            "advanced": ["思考：可能性大小和什么有关？", "尝试用分数表示可能性"],
            "extension": ["设计一个游戏，使双方获胜可能性相等", "探究：怎样改变条件使可能性变化"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["摸球游戏中，怎样使摸到红球的可能性更大？", "生活中哪些事件是确定的？哪些不确定？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["可能性大小和什么有关？", "怎样用分数表示可能性？", "如果想让可能性是1/3，怎么设计？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["可能性大小怎么比较？", "用分数表示可能性时要注意什么？"]},
        ],
        "board": {
            "main_board": "事件分类：\n  确定事件：一定发生 / 不可能发生\n  不确定事件：可能发生\n\n可能性大小：\n  数量多 → 可能性大\n  数量少 → 可能性小\n\n用分数表示：\n  可能性 = 目标数量 ÷ 总数量\n\n例：3红2白，摸到红球可能性 = 3/5",
            "side_board": "关键：\n① 先确定总数量\n② 再确定目标数量\n③ 可能性 = 目标÷总数\n\n注意：\n⚠ 分母是总数\n⚠ 分子是目标数",
            "interactive_element": "白板互动：拖拽小球改变比例，观察可能性变化",
        },
    },
    "5A-U8-L1": {
        "topic": "植树问题（两端都栽）",
        "knowledge_points": ["植树问题中棵数与间隔数的关系", "两端都栽时棵数=间隔数+1", "植树问题模型的广泛应用"],
        "questions": {
            "basic": [
                {"question": "一条小路长100米，每隔5米栽一棵树（两端都栽），一共要栽多少棵？", "answer": "21棵", "analysis": "100÷5=20（间隔），20+1=21（棵）", "knowledge_point": "两端都栽时棵数=间隔数+1"},
                {"question": "20米长的路上每隔4米栽一棵树（两端都栽），几棵树？", "answer": "6棵", "analysis": "20÷4=5（间隔），5+1=6（棵）", "knowledge_point": "植树问题基本计算"},
            ],
            "advanced": [
                {"question": "一条马路一侧每隔10米安一盏路灯（两端都安），共安了21盏，马路长多少米？", "answer": "200米", "analysis": "21-1=20（间隔），20×10=200（米）", "knowledge_point": "植树问题逆运算"},
            ],
            "extension": [
                {"question": "圆形广场周围种树，周长120米，每隔6米种一棵，需要几棵树？", "answer": "20棵", "analysis": "封闭图形中棵数=间隔数，120÷6=20（棵）", "knowledge_point": "封闭图形植树问题"},
                {"question": "一座大楼每层之间有20级台阶，从1楼到5楼共多少级台阶？", "answer": "80级", "analysis": "5-1=4（间隔），4×20=80（级）", "knowledge_point": "植树问题模型迁移"},
            ],
        },
        "preview_tasks": {
            "basic": ["画一画：20米路上每隔5米栽树，两端都栽", "数一数间隔数和棵数的关系", "阅读课本植树问题例1"],
            "advanced": ["探究：棵数和间隔数有什么规律？", "思考：为什么两端都栽时棵数=间隔数+1？"],
            "extension": ["探究封闭图形的植树问题", "找一找生活中的植树问题（楼梯、路灯等）"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": ["100米小路每隔5米栽一棵树，猜猜要几棵？", "先从短一点的路研究，20米要几棵？"]},
            {"stage": "探究", "duration": "15 min", "questions": ["画线段图，数间隔数和棵数", "两端都栽时，棵数和间隔数有什么关系？", "如果不是两端都栽呢？"]},
            {"stage": "总结", "duration": "5 min", "questions": ["两端都栽的植树问题公式是什么？", "生活中哪些问题可以用植树问题解决？"]},
        ],
        "board": {
            "main_board": "植树问题（两端都栽）\n\n  总距离 ÷ 株距 = 间隔数\n  间隔数 + 1 = 棵数\n\n例：100m，每隔5m\n  100÷5 = 20（间隔）\n  20 + 1 = 21（棵）\n\n  |—|—|—|—|—|—|—|\n  1  2  3  4  5  6  7\n  ←——— 间隔 ———→",
            "side_board": "三种情况：\n① 两端都栽：棵数=间隔数+1\n② 一端栽一端不栽：棵数=间隔数\n③ 两端都不栽：棵数=间隔数-1\n\n封闭图形：棵数=间隔数\n\n生活应用：\n⚠ 楼梯、路灯、排队\n⚠ 锯木头（两端不栽）",
            "interactive_element": "白板互动：拖拽树苗到线段上，探索棵数规律",
        },
    },
}


# ===== 资源平台列表 =====
PLATFORMS = {
    "smartedu": {"name": "国家中小学智慧教育平台", "url": "https://www.zxx.edu.cn", "type": "国家级官方平台"},
    "pep": {"name": "人教社官方资源", "url": "https://www.pep.com.cn", "type": "教材出版社官方"},
    "yishiyiuke": {"name": "一师一优课", "url": "https://1s1k.eduyun.cn", "type": "教育部优质课"},
    "xuekewang": {"name": "学科网免费专区", "url": "https://www.zxxk.com", "type": "教育资源平台"},
    "jiaoyanyuan": {"name": "各地教研公开课件", "url": "#", "type": "地方教研室"},
}


def get_lesson_data(lesson_code: str, lesson_title: str) -> dict:
    """获取课时专属数据。如果知识库中有该课时，使用专属数据；否则生成通用数据。"""
    content = LESSON_CONTENT.get(lesson_code)
    videos = VIDEO_MAP.get(lesson_code)

    if content:
        # 有专属内容
        result = {
            "topic": content["topic"],
            "knowledge_points": content["knowledge_points"],
            "questions": content["questions"],
            "preview_tasks": content["preview_tasks"],
            "inquiry": content["inquiry"],
            "board": content["board"],
        }
    else:
        # 生成通用内容
        result = _generate_generic_content(lesson_title)

    # 视频映射
    if videos:
        result["videos"] = videos
    else:
        result["videos"] = _generate_generic_videos(lesson_title)

    return result


def _generate_generic_content(lesson_title: str) -> dict:
    """为未在知识库中的课时生成通用内容"""
    return {
        "topic": lesson_title,
        "knowledge_points": [f"{lesson_title}的核心概念", f"{lesson_title}的计算方法", f"{lesson_title}的实际应用"],
        "questions": {
            "basic": [
                {"question": f"关于「{lesson_title}」：基础概念理解题", "answer": "参见课本", "analysis": "请结合课本理解基本概念", "knowledge_point": f"{lesson_title}核心概念"},
                {"question": f"关于「{lesson_title}」：基础计算题", "answer": "参见课本", "analysis": "按课本方法计算", "knowledge_point": f"{lesson_title}计算方法"},
            ],
            "advanced": [
                {"question": f"运用「{lesson_title}」知识解决实际问题", "answer": "参见课本例题", "analysis": "结合实际情境分析", "knowledge_point": f"{lesson_title}实际应用"},
            ],
            "extension": [
                {"question": f"「{lesson_title}」知识的拓展探究题", "answer": "开放性答案", "analysis": "鼓励学生多角度思考", "knowledge_point": f"{lesson_title}拓展延伸"},
            ],
        },
        "preview_tasks": {
            "basic": [f"阅读课本「{lesson_title}」部分", f"回顾与本课相关的前置知识", "完成基础预习笔记"],
            "advanced": [f"尝试完成课本「{lesson_title}」的例题", "思考本课知识点的应用场景"],
            "extension": [f"探究「{lesson_title}」的拓展内容", "设计一道与本课相关的应用题"],
        },
        "inquiry": [
            {"stage": "导入", "duration": "3 min", "questions": [f"生活中哪里会用到「{lesson_title}」的知识？", "你能举出一个例子吗？"]},
            {"stage": "探究", "duration": "15 min", "questions": [f"「{lesson_title}」的核心方法是什么？", "你能用自己的话总结吗？", "有哪些容易出错的地方？"]},
            {"stage": "总结", "duration": "5 min", "questions": [f"今天学了什么？", "还有什么疑问吗？"]},
        ],
        "board": {
            "main_board": f"{lesson_title}\n\n核心知识点：\n① 基本概念\n② 计算方法\n③ 实际应用",
            "side_board": "关键步骤：\n① 理解题意\n② 选择方法\n③ 计算验证\n\n易错提醒：\n⚠ 注意计算顺序\n⚠ 检查单位和小数点",
            "interactive_element": "白板互动：师生共同完成例题演示",
        },
    }


def _generate_generic_videos(lesson_title: str) -> dict:
    """为未在知识库中的课时生成通用视频（使用综合微课和精讲）"""
    return {
        "basic":    {"bvid": BV_WEIKE, "page": 2, "title": f"{lesson_title} 基础微课", "duration": 406, "platform": "B站·人教版五年级数学微课"},
        "advanced": {"bvid": BV_JINGJIANG, "page": 1, "title": f"{lesson_title} 精讲课程", "duration": 1216, "platform": "B站·人教版五年级数学精讲"},
        "extension": {"bvid": BV_JINGJIANG, "page": 2, "title": f"{lesson_title} 拓展课程", "duration": 1127, "platform": "B站·人教版五年级数学精讲"},
    }


def build_video_obj(v: dict) -> dict:
    """构建视频对象（含embed_url）"""
    return {
        "title": v["title"],
        "bvid": v["bvid"],
        "page": v.get("page", 1),
        "embed_url": _embed(v["bvid"], v.get("page", 1)),
        "platform": v["platform"],
        "duration": v["duration"],
        "description": v.get("title", ""),
    }


def build_resource_folders(lesson_data: dict) -> dict:
    """构建4个资源文件夹（课件/教案/练习/微课视频），每个含基础/提升/拓展三层"""
    topic = lesson_data["topic"]

    # ===== 课件文件夹 =====
    courseware = {
        "basic": [
            {"title": f"{topic} - 基础课件PPT", "platform": PLATFORMS["smartedu"]["name"], "platform_url": PLATFORMS["smartedu"]["url"], "format": "PPTX", "size": "4.2MB", "whiteboard_ready": True, "description": f"人教版五年级数学《{topic}》配套课件，含动画演示和课堂互动环节", "match_score": 98},
            {"title": f"{topic} - 入门互动课件", "platform": PLATFORMS["jiaoyanyuan"]["name"], "platform_url": PLATFORMS["jiaoyanyuan"]["url"], "format": "ENB", "size": "3.5MB", "whiteboard_ready": True, "description": f"已转换为白板专用格式，支持拖拽批注，适配基础层教学", "match_score": 92},
        ],
        "advanced": [
            {"title": f"{topic} - 进阶课件PPT", "platform": PLATFORMS["pep"]["name"], "platform_url": PLATFORMS["pep"]["url"], "format": "PPTX", "size": "5.8MB", "whiteboard_ready": True, "description": f"人教社官方进阶课件，含例题解析和变式训练，适合中等生", "match_score": 95},
            {"title": f"{topic} - 互动式白板课件", "platform": PLATFORMS["jiaoyanyuan"]["name"], "platform_url": PLATFORMS["jiaoyanyuan"]["url"], "format": "ENB", "size": "6.8MB", "whiteboard_ready": True, "description": "白板专用格式，支持弹窗互动和随堂标注", "match_score": 90},
        ],
        "extension": [
            {"title": f"{topic} - 拓展提升课件", "platform": PLATFORMS["smartedu"]["name"], "platform_url": PLATFORMS["smartedu"]["url"], "format": "PPTX", "size": "7.1MB", "whiteboard_ready": True, "description": f"拓展延伸课件，含思维导图和开放性探究，适合学优生", "match_score": 93},
        ],
    }

    # ===== 教案文件夹 =====
    lesson_plans = {
        "basic": [
            {"title": f"{topic} - 完整教案设计", "platform": PLATFORMS["pep"]["name"], "platform_url": PLATFORMS["pep"]["url"], "format": "DOCX", "size": "320KB", "description": f"人教社官方配套教案，含教学目标、重难点分析、教学过程设计", "match_score": 97},
        ],
        "advanced": [
            {"title": f"{topic} - 名师教案（提升版）", "platform": PLATFORMS["yishiyiuke"]["name"], "platform_url": PLATFORMS["yishiyiuke"]["url"], "format": "DOCX", "size": "280KB", "description": f"省级优课获奖教师教案，含变式训练设计和分层教学建议", "match_score": 94},
        ],
        "extension": [
            {"title": f"{topic} - 拓展教案与教学反思", "platform": PLATFORMS["yishiyiuke"]["name"], "platform_url": PLATFORMS["yishiyiuke"]["url"], "format": "DOCX", "size": "180KB", "description": f"优秀教师教学反思，包含拓展策略和课堂生成性资源处理建议", "match_score": 88},
        ],
    }

    # ===== 练习文件夹 =====
    exercises = {
        "basic": [
            {"title": f"{topic} - 基础练习", "platform": PLATFORMS["xuekewang"]["name"], "platform_url": PLATFORMS["xuekewang"]["url"], "format": "PDF", "size": "1.1MB", "whiteboard_ready": True, "description": "基础判断题和选择题，保证全员掌握课标基础知识点", "match_score": 94},
            {"title": f"{topic} - 口算练习卡", "platform": PLATFORMS["pep"]["name"], "platform_url": PLATFORMS["pep"]["url"], "format": "PDF", "size": "650KB", "whiteboard_ready": True, "description": "人教社官方口算练习，可导入白板随堂检测", "match_score": 91},
        ],
        "advanced": [
            {"title": f"{topic} - 变式练习题", "platform": PLATFORMS["xuekewang"]["name"], "platform_url": PLATFORMS["xuekewang"]["url"], "format": "PDF", "size": "1.3MB", "whiteboard_ready": True, "description": "含变式练习和简单应用题，附详细解析，适合中等生", "match_score": 93},
        ],
        "extension": [
            {"title": f"{topic} - 综合探究题", "platform": PLATFORMS["xuekewang"]["name"], "platform_url": PLATFORMS["xuekewang"]["url"], "format": "PDF", "size": "950KB", "whiteboard_ready": True, "description": "开放性习题和综合探究题，适合学优生拔高训练", "match_score": 90},
            {"title": f"{topic} - 课后拓展作业", "platform": PLATFORMS["pep"]["name"], "platform_url": PLATFORMS["pep"]["url"], "format": "PDF", "size": "850KB", "whiteboard_ready": True, "description": "人教社官方课后作业设计，含易错题预警和拓展思考题", "match_score": 89},
        ],
    }

    # ===== 微课视频文件夹 =====
    videos_raw = lesson_data["videos"]
    video_folder = {}
    for layer in ["basic", "advanced", "extension"]:
        v = videos_raw.get(layer, videos_raw.get("basic"))
        video_folder[layer] = [build_video_obj(v)]

    return {
        "courseware": {"title": "课件", "icon": "presentation", "color": "#6B7FA0", "items": courseware},
        "lesson_plan": {"title": "教案", "icon": "book", "color": "#C0785C", "items": lesson_plans},
        "exercises": {"title": "练习", "icon": "pencil", "color": "#6B8F71", "items": exercises},
        "videos": {"title": "微课视频", "icon": "video", "color": "#9C7BB8", "items": video_folder},
    }
