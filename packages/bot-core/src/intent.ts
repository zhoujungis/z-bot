export type Intent =
  | 'CHAT'
  | 'QUESTION'
  | 'MEMORY_STORE'
  | 'MEMORY_SEARCH'
  | 'TASK'
  | 'REMINDER'
  | 'TODO'
  | 'FILE_OPERATION'
  | 'WEB_SEARCH'
  | 'WEB_BROWSE'
  | 'IMAGE_ANALYSIS'
  | 'SYSTEM_ACTION';

export interface IntentDecision {
  intent: Intent;
  mode: 'direct' | 'agent';
  reason: string;
}

const MEMORY_STORE = /^(?:请|帮我|麻烦)?(?:记住|记一下|remember\b)/i;
const MEMORY_SEARCH =
  /(?:之前|以前|上次|曾经).{0,20}(?:说|提|决定|告诉|remember|said)|(?:还记得|记忆|memory|回忆)/i;
const FILE_OPERATION =
  /(?:整理|分类|归档|清理|移动|复制|删除|重命名|列出|看看|扫描|查找|搜索).{0,30}(?:文件|目录|文件夹|downloads?|documents?|desktop|图片|pdf|压缩包)|(?:文件|目录|文件夹|downloads?|documents?).{0,30}(?:整理|分类|归档|清理|移动|复制|删除|重命名|列出|看看|扫描|查找|搜索)/i;
const REMINDER =
  /(?:提醒|remind|schedule|alarm).{0,80}(?:点|天|日|周|月|明天|后天|上午|下午|晚上|at\b|tomorrow|daily|weekly)|(?:明天|后天|上午|下午|晚上).{0,40}(?:提醒|remind)/i;
const TODO =
  /(?:待办|todo|to-do|任务清单|加个任务|创建任务|记个任务)/i;
const WEB_SEARCH =
  /(?:搜索|搜一下|搜下|查一下|查查|网上查|web\s*search|search\s+(?:the\s+)?web|google\s+)/i;
const WEB_BROWSE =
  /(?:https?:\/\/|www\.|打开.{0,20}(?:网页|链接|网站)|看看.{0,20}(?:这个)?网页|读取.{0,20}网页|总结.{0,20}(?:网页|链接)|browse|open\s+the\s+(?:page|link|website))/i;
const SYSTEM_ACTION =
  /(?:截图|screenshot|捕获屏幕|剪贴板|clipboard)/i;
const IMAGE_ANALYSIS =
  /(?:这张图|截图|图片|报错|界面|image|screenshot).{0,30}(?:什么|分析|看|意思|问题|error|analy[sz]e)/i;

export function classifyIntent(
  text: string,
  quickAction?: 'ask' | 'remember' | 'todo' | 'reminder'
): IntentDecision {
  const content = text.trim();

  if (quickAction === 'remember' || MEMORY_STORE.test(content)) {
    return { intent: 'MEMORY_STORE', mode: 'direct', reason: 'explicit memory request' };
  }
  if (quickAction === 'todo') {
    return { intent: 'TODO', mode: 'agent', reason: 'quick action todo' };
  }
  if (quickAction === 'reminder') {
    return { intent: 'REMINDER', mode: 'agent', reason: 'quick action reminder' };
  }
  if (TODO.test(content)) {
    return { intent: 'TODO', mode: 'agent', reason: 'todo keywords' };
  }
  if (REMINDER.test(content)) {
    return { intent: 'REMINDER', mode: 'agent', reason: 'reminder keywords' };
  }
  if (WEB_SEARCH.test(content)) {
    return { intent: 'WEB_SEARCH', mode: 'agent', reason: 'web search keywords' };
  }
  if (WEB_BROWSE.test(content)) {
    return { intent: 'WEB_BROWSE', mode: 'agent', reason: 'web browsing keywords' };
  }
  if (SYSTEM_ACTION.test(content)) {
    return { intent: 'SYSTEM_ACTION', mode: 'agent', reason: 'system action keywords' };
  }
  if (FILE_OPERATION.test(content)) {
    return { intent: 'FILE_OPERATION', mode: 'agent', reason: 'file operation keywords' };
  }
  if (MEMORY_SEARCH.test(content)) {
    return { intent: 'MEMORY_SEARCH', mode: 'direct', reason: 'memory recall' };
  }
  if (IMAGE_ANALYSIS.test(content)) {
    return { intent: 'IMAGE_ANALYSIS', mode: 'direct', reason: 'image analysis' };
  }
  if (/^(?:hi|hello|hey|你好|您好|嗨|早上好|晚上好|在吗)[！!。.\s]*$/i.test(content)) {
    return { intent: 'CHAT', mode: 'direct', reason: 'greeting' };
  }
  if (/(?:什么是|是什么|解释|为什么|怎么|如何|what is|explain|why|how does)/i.test(content)) {
    return { intent: 'QUESTION', mode: 'direct', reason: 'question' };
  }
  if (content.length <= 80) {
    return { intent: 'CHAT', mode: 'direct', reason: 'short conversational request' };
  }
  return { intent: 'TASK', mode: 'agent', reason: 'long or ambiguous request' };
}
