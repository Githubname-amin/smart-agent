import { message } from "antd";

export const handleCopyMessage = (item) => {
  try {
    // 这里直接使用navigator.clipboard.writeText会报错，因为环境不同。如果使用调用api的方式的话，不如间接使用idea的方法
    // 创建临时文本区域
    const textArea = document.createElement("textarea");
    textArea.value = item.content;

    // 将文本区域添加到文档中
    document.body.appendChild(textArea);

    // 选中文本
    textArea.select();

    // 执行复制命令
    document.execCommand("copy");

    // 移除临时文本区域
    document.body.removeChild(textArea);

    message.success("复制成功");
  } catch (error) {
    console.error("复制失败:", error);
    message.error("复制失败");
  }
};

// 检测复制的内容是否为代码的辅助函数
export const detectIfCode = (text) => {
  // 这里可以添加更复杂的代码检测逻辑
  // 例如：检查是否包含常见的编程语言关键字、特殊字符等
  const codeIndicators = [
    /^(const|let|var|function|class|import|export|if|for|while)/m,
    /[{};]/,
    /^\s*\/\//m, // 检测注释
    /^\s*[a-zA-Z]+\s*\([^\)]*\)\s*{/m // 检测函数定义
  ];

  return codeIndicators.some((indicator) => indicator.test(text));
};

// 检测是否是代码块的开始
export const isCodeBlockStart = (content) => {
  return content.includes("```");
};

// 检测代码块的语言，先识别JavaScript
export const detectLanguage = (content) => {
  const match = content.match(/```(\w+)?/);
  console.log("当前语言", match);

  return match ? match[1] || "javascript" : "javascript";
};

/**
 * 生成traceId
 */
export function generateTraceId() {
  let timestamp = new Date().getTime();
  let random = Math.floor(Math.random() * 1000000);
  return `trace_${timestamp}_${random}`;
}
