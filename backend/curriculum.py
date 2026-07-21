"""人教版五年级上册数学 - 完整知识树定义

每个知识点包含：
- id: 唯一标识
- name: 知识点名称
- unit_code: 单元代码
- lesson_code: 课时代码
- keywords: 用于匹配学生练习/错题数据的关键词列表
- category: 分类（计算/几何/统计/代数/应用）
"""

# 知识树结构：单元 -> 课时 -> 知识点
KNOWLEDGE_TREE = {
    "u1": {
        "unit_name": "第一单元 观察简单组合体",
        "category": "几何",
        "lessons": {
            "u1-l1": {
                "title": "从不同方向观察同一组合体的形状",
                "knowledge_points": [
                    {"id": "u1l1-observe", "name": "从不同方向观察物体", "keywords": ["观察", "方向", "正面", "上面", "左面", "组合体"]},
                ],
            },
            "u1-l2": {
                "title": "从同一方向观察不同组合体的形状",
                "knowledge_points": [
                    {"id": "u1l2-same-view", "name": "不同物体相同视图", "keywords": ["同一方向", "不同", "相同", "视图", "形状"]},
                ],
            },
            "u1-l3": {
                "title": "根据看到的图形摆组合体",
                "knowledge_points": [
                    {"id": "u1l3-restore", "name": "根据视图还原物体", "keywords": ["摆", "还原", "根据", "图形", "视图"]},
                ],
            },
        },
    },
    "u2": {
        "unit_name": "第二单元 小数乘法",
        "category": "计算",
        "lessons": {
            "u2-l1": {
                "title": "小数乘整数（1）",
                "knowledge_points": [
                    {"id": "u2l1-decimal-int", "name": "小数乘整数算理", "keywords": ["小数乘整数", "算理", "小数乘法"]},
                ],
            },
            "u2-l2": {
                "title": "小数乘整数（2）",
                "knowledge_points": [
                    {"id": "u2l2-decimal-int-calc", "name": "小数乘整数竖式", "keywords": ["小数乘整数", "竖式", "计算"]},
                ],
            },
            "u2-l3": {
                "title": "小数乘小数的计算方法",
                "knowledge_points": [
                    {"id": "u2l3-decimal-decimal", "name": "小数乘小数", "keywords": ["小数乘小数", "小数乘法"]},
                ],
            },
            "u2-l4": {
                "title": "积的小数位数不够的处理方法",
                "knowledge_points": [
                    {"id": "u2l4-insufficient-digits", "name": "积的小数位数不够补0", "keywords": ["积", "小数位数", "不够", "补零", "补0"]},
                ],
            },
            "u2-l5": {
                "title": "求一个数的小数倍是多少",
                "knowledge_points": [
                    {"id": "u2l5-decimal-multiple", "name": "小数倍应用题", "keywords": ["小数倍", "求一个数", "倍数"]},
                ],
            },
            "u2-l6": {
                "title": "整数乘法运算律推广到小数",
                "knowledge_points": [
                    {"id": "u2l6-laws", "name": "乘法运算律推广", "keywords": ["运算律", "交换律", "结合律", "分配律", "推广"]},
                ],
            },
            "u2-l7": {
                "title": "估算解决实际问题",
                "knowledge_points": [
                    {"id": "u2l7-estimate", "name": "小数乘法估算", "keywords": ["估算", "大约", "估计"]},
                ],
            },
            "u2-l8": {
                "title": "分段计费的实际问题",
                "knowledge_points": [
                    {"id": "u2l8-tiered-billing", "name": "分段计费问题", "keywords": ["分段", "计费", "收费", "出租车", "水电费"]},
                ],
            },
        },
    },
    "u3": {
        "unit_name": "第三单元 小数除法",
        "category": "计算",
        "lessons": {
            "u3-l1": {
                "title": "整数除以整数商是小数",
                "knowledge_points": [
                    {"id": "u3l1-int-div-int", "name": "整数除以整数商为小数", "keywords": ["整数除以整数", "商是小数", "小数除法"]},
                ],
            },
            "u3-l2": {
                "title": "小数除以整数商是小数",
                "knowledge_points": [
                    {"id": "u3l2-decimal-div-int", "name": "小数除以整数", "keywords": ["小数除以整数", "小数除法", "除以整数"]},
                ],
            },
            "u3-l3": {
                "title": "小数除以整数商的整数部分不够商1",
                "knowledge_points": [
                    {"id": "u3l3-insufficient-quotient", "name": "商不够商1的处理", "keywords": ["不够商1", "整数部分", "商", "小数除法"]},
                ],
            },
            "u3-l4": {
                "title": "循环小数",
                "knowledge_points": [
                    {"id": "u3l4-repeating", "name": "循环小数", "keywords": ["循环小数", "无限小数", "循环节"]},
                ],
            },
            "u3-l5": {
                "title": "一个数除以小数的计算方法",
                "knowledge_points": [
                    {"id": "u3l5-div-decimal", "name": "除数是小数的除法", "keywords": ["除以小数", "除数是小数", "小数除法", "移动小数点"]},
                ],
            },
            "u3-l6": {
                "title": "被除数的小数位数比除数少的小数除法",
                "knowledge_points": [
                    {"id": "u3l6-fewer-digits", "name": "被除数位数不够的除法", "keywords": ["被除数", "位数", "不够", "补0", "小数除法"]},
                ],
            },
            "u3-l7": {
                "title": "灵活取商的近似数解决问题",
                "knowledge_points": [
                    {"id": "u3l7-approximate", "name": "商的近似数", "keywords": ["近似数", "四舍五入", "保留", "商"]},
                ],
            },
        },
    },
    "u4": {
        "unit_name": "第四单元 图形的运动",
        "category": "几何",
        "lessons": {
            "u4-l1": {
                "title": "轴对称图形的特征",
                "knowledge_points": [
                    {"id": "u4l1-axis-symmetry", "name": "轴对称图形", "keywords": ["轴对称", "对称轴", "对称图形"]},
                ],
            },
            "u4-l2": {
                "title": "在方格纸上补全轴对称图形",
                "knowledge_points": [
                    {"id": "u4l2-complete-symmetry", "name": "补全轴对称图形", "keywords": ["补全", "轴对称", "方格", "对称"]},
                ],
            },
            "u4-l3": {
                "title": "平移的特征",
                "knowledge_points": [
                    {"id": "u4l3-translation", "name": "平移的特征", "keywords": ["平移", "特征", "方向", "距离"]},
                ],
            },
            "u4-l4": {
                "title": "平移的特征及画平移后的图形",
                "knowledge_points": [
                    {"id": "u4l4-draw-translation", "name": "画平移图形", "keywords": ["平移", "画", "图形", "方格"]},
                ],
            },
            "u4-l5": {
                "title": "运用平移知识解决问题",
                "knowledge_points": [
                    {"id": "u4l5-translation-app", "name": "平移解决问题", "keywords": ["平移", "解决问题", "面积", "应用"]},
                ],
            },
            "u4-l6": {
                "title": "旋转的含义和特征",
                "knowledge_points": [
                    {"id": "u4l6-rotation", "name": "旋转的特征", "keywords": ["旋转", "含义", "特征", "中心", "角度"]},
                ],
            },
            "u4-l7": {
                "title": "旋转90度后的图形的画法",
                "knowledge_points": [
                    {"id": "u4l7-draw-rotation", "name": "画旋转图形", "keywords": ["旋转", "90", "画", "图形"]},
                ],
            },
            "u4-l8": {
                "title": "用平移和旋转解决问题",
                "knowledge_points": [
                    {"id": "u4l8-combined", "name": "平移和旋转综合", "keywords": ["平移", "旋转", "综合", "解决问题"]},
                ],
            },
            "u4-l9": {
                "title": "设计图案",
                "knowledge_points": [
                    {"id": "u4l9-pattern", "name": "图案设计", "keywords": ["图案", "设计", "对称", "平移", "旋转"]},
                ],
            },
        },
    },
    "u5": {
        "unit_name": "第五单元 用字母表示数和数量关系",
        "category": "代数",
        "lessons": {
            "u5-l1": {
                "title": "用含有字母的式子表示加减数量关系",
                "knowledge_points": [
                    {"id": "u5l1-letter-add-sub", "name": "字母表示加减关系", "keywords": ["字母", "表示", "加减", "数量关系"]},
                ],
            },
            "u5-l2": {
                "title": "用含有字母的式子表示乘除数量关系",
                "knowledge_points": [
                    {"id": "u5l2-letter-mul-div", "name": "字母表示乘除关系", "keywords": ["字母", "表示", "乘除", "数量关系"]},
                ],
            },
            "u5-l3": {
                "title": "用字母表示运算律、公式和等式的基本性质",
                "knowledge_points": [
                    {"id": "u5l3-letter-formulas", "name": "字母表示运算律和公式", "keywords": ["字母", "运算律", "公式", "等式", "性质"]},
                ],
            },
            "u5-l4": {
                "title": "用含有字母的式子表示探究的规律",
                "knowledge_points": [
                    {"id": "u5l4-letter-patterns", "name": "字母表示规律", "keywords": ["字母", "规律", "探究"]},
                ],
            },
            "u5-l5": {
                "title": "用含有字母的式子解决问题",
                "knowledge_points": [
                    {"id": "u5l5-letter-solve", "name": "字母式解决问题", "keywords": ["字母", "解决问题", "代入", "求值"]},
                ],
            },
            "u5-l6": {
                "title": "探秘百数表",
                "knowledge_points": [
                    {"id": "u5l6-hundred-chart", "name": "百数表规律", "keywords": ["百数表", "规律", "探究"]},
                ],
            },
        },
    },
    "u6": {
        "unit_name": "第六单元 多边形的面积",
        "category": "几何",
        "lessons": {
            "u6-l1": {
                "title": "平行四边形面积计算公式的推导",
                "knowledge_points": [
                    {"id": "u6l1-parallelogram-area", "name": "平行四边形面积", "keywords": ["平行四边形", "面积", "底", "高"]},
                ],
            },
            "u6-l2": {
                "title": "平行四边形面积的实际应用",
                "knowledge_points": [
                    {"id": "u6l2-parallelogram-app", "name": "平行四边形面积应用", "keywords": ["平行四边形", "面积", "应用", "实际"]},
                ],
            },
            "u6-l3": {
                "title": "公顷与平方千米",
                "knowledge_points": [
                    {"id": "u6l3-hectare", "name": "公顷与平方千米", "keywords": ["公顷", "平方千米", "面积单位", "换算"]},
                ],
            },
            "u6-l4": {
                "title": "三角形面积计算公式的推导",
                "knowledge_points": [
                    {"id": "u6l4-triangle-area", "name": "三角形面积", "keywords": ["三角形", "面积", "底", "高", "推导"]},
                ],
            },
            "u6-l5": {
                "title": "三角形面积的实际应用",
                "knowledge_points": [
                    {"id": "u6l5-triangle-app", "name": "三角形面积应用", "keywords": ["三角形", "面积", "应用", "实际"]},
                ],
            },
            "u6-l6": {
                "title": "梯形面积计算公式的推导",
                "knowledge_points": [
                    {"id": "u6l6-trapezoid-area", "name": "梯形面积", "keywords": ["梯形", "面积", "上底", "下底", "高"]},
                ],
            },
            "u6-l7": {
                "title": "梯形面积的实际应用",
                "knowledge_points": [
                    {"id": "u6l7-trapezoid-app", "name": "梯形面积应用", "keywords": ["梯形", "面积", "应用", "实际"]},
                ],
            },
            "u6-l8": {
                "title": "组合图形面积的计算方法",
                "knowledge_points": [
                    {"id": "u6l8-composite-area", "name": "组合图形面积", "keywords": ["组合图形", "面积", "分割", "添补"]},
                ],
            },
            "u6-l9": {
                "title": "不规则图形的面积",
                "knowledge_points": [
                    {"id": "u6l9-irregular-area", "name": "不规则图形面积", "keywords": ["不规则", "面积", "估算", "方格"]},
                ],
            },
            "u6-l10": {
                "title": "格点多边形的面积",
                "knowledge_points": [
                    {"id": "u6l10-grid-polygon", "name": "格点多边形面积", "keywords": ["格点", "多边形", "面积", "皮克"]},
                ],
            },
        },
    },
    "u7": {
        "unit_name": "第七单元 可能性",
        "category": "统计",
        "lessons": {
            "u7-l1": {
                "title": "事件发生的确定性和不确定性",
                "knowledge_points": [
                    {"id": "u7l1-certain-uncertain", "name": "确定性与不确定性", "keywords": ["确定", "不确定", "可能", "不可能", "一定"]},
                ],
            },
            "u7-l2": {
                "title": "事件发生的可能性大小",
                "knowledge_points": [
                    {"id": "u7l2-possibility-size", "name": "可能性大小", "keywords": ["可能性", "大小", "概率", "可能性大", "可能性小"]},
                ],
            },
            "u7-l3": {
                "title": "根据可能性大小推测",
                "knowledge_points": [
                    {"id": "u7l3-predict", "name": "根据可能性推测", "keywords": ["可能性", "推测", "预测", "判断"]},
                ],
            },
        },
    },
    "u8": {
        "unit_name": "数学广角：植树问题",
        "category": "应用",
        "lessons": {
            "u8-l1": {
                "title": "植树问题-例1",
                "knowledge_points": [
                    {"id": "u8l1-plant-both-ends", "name": "植树问题（两端都栽）", "keywords": ["植树", "两端", "栽", "间隔", "棵数"]},
                ],
            },
            "u8-l2": {
                "title": "植树问题-例2",
                "knowledge_points": [
                    {"id": "u8l2-plant-one-end", "name": "植树问题（一端栽）", "keywords": ["植树", "一端", "栽", "间隔"]},
                ],
            },
            "u8-l3": {
                "title": "植树问题-例3",
                "knowledge_points": [
                    {"id": "u8l3-plant-closed", "name": "植树问题（封闭图形）", "keywords": ["植树", "封闭", "圆形", "间隔"]},
                ],
            },
        },
    },
}


def get_all_knowledge_points():
    """获取所有知识点列表（扁平化）"""
    points = []
    for unit_code, unit_data in KNOWLEDGE_TREE.items():
        for lesson_code, lesson_data in unit_data["lessons"].items():
            for kp in lesson_data["knowledge_points"]:
                points.append({
                    **kp,
                    "unit_code": unit_code,
                    "unit_name": unit_data["unit_name"],
                    "lesson_code": lesson_code,
                    "lesson_title": lesson_data["title"],
                    "category": unit_data["category"],
                })
    return points


def match_knowledge_point(text, kp):
    """检查文本是否包含知识点的任一关键词"""
    if not text:
        return False
    text_lower = text.lower()
    for kw in kp.get("keywords", []):
        if kw.lower() in text_lower:
            return True
    return False
