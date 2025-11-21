import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./components/auth/AuthProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
