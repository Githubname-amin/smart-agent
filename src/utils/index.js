import { message } from "antd";

export const handleCopyMessage = (item) => {
  navigator.clipboard.writeText(item.content);
  message.success("复制成功");
};

// 检测是否为代码的辅助函数
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
