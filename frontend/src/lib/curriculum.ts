/**
 * 人教版五年级上册数学课时目录
 * 来源：人教版五上数学课时目录.docx
 */

export interface Lesson {
  code: string;       // 课时编码，如 "5A-U2-L1"
  title: string;      // 课时名称
}

export interface Unit {
  code: string;       // 单元编码，如 "5A-U2"
  name: string;       // 单元名称
  lessons: Lesson[];
}

export const curriculum: Unit[] = [
  {
    code: '5A-U1',
    name: '第一单元 观察简单组合体',
    lessons: [
      { code: '5A-U1-L1', title: '从不同方向观察同一组合体的形状' },
      { code: '5A-U1-L2', title: '从同一方向观察不同组合体的形状' },
      { code: '5A-U1-L3', title: '根据看到的图形摆组合体' },
    ],
  },
  {
    code: '5A-U2',
    name: '第二单元 小数乘法',
    lessons: [
      { code: '5A-U2-L1', title: '小数乘整数（1）' },
      { code: '5A-U2-L2', title: '小数乘整数（2）' },
      { code: '5A-U2-L3', title: '小数乘小数的计算方法' },
      { code: '5A-U2-L4', title: '积的小数位数不够的处理方法' },
      { code: '5A-U2-L5', title: '求一个数的小数倍是多少' },
      { code: '5A-U2-L6', title: '整数乘法运算律推广到小数' },
      { code: '5A-U2-L7', title: '估算解决实际问题' },
      { code: '5A-U2-L8', title: '分段计费的实际问题' },
    ],
  },
  {
    code: '5A-U3',
    name: '第三单元 小数除法',
    lessons: [
      { code: '5A-U3-L1', title: '整数除以整数商是小数' },
      { code: '5A-U3-L2', title: '小数除以整数商是小数' },
      { code: '5A-U3-L3', title: '小数除以整数商的整数部分不够商1' },
      { code: '5A-U3-L4', title: '循环小数' },
      { code: '5A-U3-L5', title: '一个数除以小数的计算方法' },
      { code: '5A-U3-L6', title: '被除数的小数位数比除数少的小数除法' },
      { code: '5A-U3-L7', title: '灵活取商的近似数解决问题' },
    ],
  },
  {
    code: '5A-U4',
    name: '第四单元 图形的运动',
    lessons: [
      { code: '5A-U4-L1', title: '轴对称图形的特征' },
      { code: '5A-U4-L2', title: '在方格纸上补全轴对称图形' },
      { code: '5A-U4-L3', title: '平移的特征' },
      { code: '5A-U4-L4', title: '平移的特征及画平移后的图形' },
      { code: '5A-U4-L5', title: '运用平移知识解决问题' },
      { code: '5A-U4-L6', title: '旋转的含义和特征' },
      { code: '5A-U4-L7', title: '旋转90度后的图形的画法' },
      { code: '5A-U4-L8', title: '用平移和旋转解决问题' },
      { code: '5A-U4-L9', title: '设计图案' },
    ],
  },
  {
    code: '5A-U5',
    name: '第五单元 用字母表示数和数量关系',
    lessons: [
      { code: '5A-U5-L1', title: '用含有字母的式子表示加减数量关系' },
      { code: '5A-U5-L2', title: '用含有字母的式子表示乘除数量关系' },
      { code: '5A-U5-L3', title: '用字母表示运算律、公式和等式的基本性质' },
      { code: '5A-U5-L4', title: '用含有字母的式子表示探究的规律' },
      { code: '5A-U5-L5', title: '用含有字母的式子解决问题' },
      { code: '5A-U5-L6', title: '探秘百数表' },
    ],
  },
  {
    code: '5A-U6',
    name: '第六单元 多边形的面积',
    lessons: [
      { code: '5A-U6-L1', title: '平行四边形面积计算公式的推导' },
      { code: '5A-U6-L2', title: '平行四边形面积的实际应用' },
      { code: '5A-U6-L3', title: '公顷与平方千米' },
      { code: '5A-U6-L4', title: '三角形面积计算公式的推导' },
      { code: '5A-U6-L5', title: '三角形面积的实际应用' },
      { code: '5A-U6-L6', title: '梯形面积计算公式的推导' },
      { code: '5A-U6-L7', title: '梯形面积的实际应用' },
      { code: '5A-U6-L8', title: '组合图形面积的计算方法' },
      { code: '5A-U6-L9', title: '不规则图形的面积' },
      { code: '5A-U6-L10', title: '格点多边形的面积' },
    ],
  },
  {
    code: '5A-U7',
    name: '第七单元 可能性',
    lessons: [
      { code: '5A-U7-L1', title: '事件发生的确定性和不确定性' },
      { code: '5A-U7-L2', title: '事件发生的可能性大小' },
      { code: '5A-U7-L3', title: '根据可能性大小推测' },
    ],
  },
  {
    code: '5A-U8',
    name: '数学广角：植树问题',
    lessons: [
      { code: '5A-U8-L1', title: '植树问题——例1（两端都栽）' },
      { code: '5A-U8-L2', title: '植树问题——例2（两端都不栽）' },
      { code: '5A-U8-L3', title: '植树问题——例3（一端栽一端不栽/封闭图形）' },
    ],
  },
];

/**
 * 免费教学资源平台推荐
 */
export interface ResourceLink {
  platform: string;
  type: '课件' | '教案' | '视频' | '试题';
  url: string;
  desc: string;
}

export const freeResourcePlatforms: ResourceLink[] = [
  { platform: '国家中小学智慧教育平台', type: '课件', url: 'https://www.zxx.edu.cn/smartClassroom', desc: '官方免费课件、教案、微课，按教材章节分类' },
  { platform: '国家中小学智慧教育平台', type: '视频', url: 'https://www.zxx.edu.cn/qualityCourse', desc: '名师优课视频，可按年级学科筛选' },
  { platform: '一师一优课', type: '视频', url: 'https://1s1k.eduyun.cn', desc: '教育部优课评选平台，大量优质课堂实录' },
  { platform: '教育资源公共服务平台', type: '教案', url: 'https://www.eduyun.cn', desc: '全国教师共享教案、课件资源' },
  { platform: '学科网', type: '试题', url: 'https://www.zxxk.com', desc: '海量试题、试卷资源，部分免费下载' },
  { platform: '菁优网', type: '试题', url: 'https://www.jyeoo.com', desc: '数学专题题库，含详细解析' },
  { platform: '21世纪教育网', type: '课件', url: 'https://www.21cnjy.com', desc: '教师课件分享平台，按课时分类' },
  { platform: '人教数字校园', type: '课件', url: 'https://www.pep.com.cn', desc: '人教社官方数字资源，配套教材' },
];
