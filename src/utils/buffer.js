export class CodeBuffer {
  constructor(windowSize = 50) {
    this.buffer = ""; // 主缓冲区
    this.isInCodeBlock = false; // 是否在代码块内
    this.currentLanguage = null; // 当前代码块的语言
    this.codeContent = ""; // 当前代码块的内容
    this.textContent = ""; // 普通文本内容

    // 滑动窗口相关
    this.windowSize = windowSize; // 滑动窗口大小
    this.slidingWindow = []; // 滑动窗口
    this.outputQueue = []; // 输出队列
    this.specialChars = {
      inlineCode: ["`"],
      mathSymbol: ["+", "-", "*", "/"]
    };
  }

  // 处理新的内容块
  process(chunk) {
    this.buffer += chunk;
    console.log("this.buffer", this.buffer);
    // 查找完整的代码块标记
    const startMatch = this.buffer.match(/```(\w+)?/);
    const endMatch = this.buffer.match(/```\n?/g);

    // 如果找到开始标记且不在代码块中
    if (startMatch && !this.isInCodeBlock) {
      this.isInCodeBlock = true;
      this.currentLanguage = startMatch[1] || "javascript";
      // 将开始标记之前的内容添加到文本内容
      this.textContent += this.buffer.slice(0, startMatch.index);
      // 更新缓冲区
      this.buffer = this.buffer.slice(startMatch.index + startMatch[0].length);
      return {
        type: "text",
        content: this.textContent
      };
    }

    // 如果在代码块中且找到结束标记
    if (this.isInCodeBlock && endMatch) {
      const endIndex = this.buffer.indexOf("```");

      debugger;
      // 收集代码内容
      this.codeContent += this.buffer.slice(0, endIndex);
      // 重置状态
      this.isInCodeBlock = false;
      const code = this.codeContent;
      this.codeContent = "";
      // 更新缓冲区
      this.buffer = this.buffer.slice(endIndex + 3);
      return {
        type: "code",
        language: this.currentLanguage,
        content: code
      };
    }

    // 如果在代码块中
    if (this.isInCodeBlock) {
      this.codeContent += this.buffer;
      this.buffer = "";
      return null; // 继续收集
    }

    // 普通文本处理
    this.textContent = this.buffer;
    this.buffer = "";
    // 如果是文本换行，需要打特殊标记
    return {
      type: "text",
      isNewLine: !this.isInCodeBlock,
      content: this.textContent
    };
  }

  // 清空缓冲区
  flush() {
    const remaining = this.buffer + this.codeContent + this.textContent;
    this.reset();
    return remaining
      ? {
          type: "text",
          content: remaining
        }
      : null;
  }

  // 重置所有状态
  reset() {
    this.buffer = "";
    this.isInCodeBlock = false;
    this.currentLanguage = null;
    this.codeContent = "";
    this.textContent = "";
  }

  // 处理滑动窗口中的特殊字符
  processWindowSpecialChars(text) {
    const parts = [];
    let lastIndex = 0;
    for (const char of text) {
      if (this.specialChars.inlineCode.includes(char)) {
        parts.push(text.slice(lastIndex, text.indexOf(char)));
        lastIndex = text.indexOf(char) + 1;
      }
    }
  }
}
