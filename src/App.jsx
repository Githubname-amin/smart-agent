import "./App.css";
import Chat from "./page/chat";
import { pluginParams } from "./server/websocket";
function App() {
  return (
    <div
      className={`App ${
        pluginParams.get("isDark") === "true" ? "App-dark" : ""
        // ""
      }`}
    >
      <Chat />
    </div>
  );
}

export default App;
