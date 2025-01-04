# React Hooks 完全指南

在 React 开发中，`Hooks` 是一个革命性的特性。让我们来学习几个常用的 Hook：

## useState 状态管理
使用 `useState` 可以让函数组件拥有状态：
- 声明方式：`const [state, setState] = useState(initialValue)`
- 更新方式：`setState(newValue)`

## useEffect 副作用处理
`useEffect` 用于处理组件的副作用：
- 组件挂载：相当于 `componentDidMount`
- 数据更新：类似 `componentDidUpdate`
- 清理操作：等同于 `componentWillUnmount`

主要使用场景：
1. 数据获取
2. 订阅管理
3. DOM 操作