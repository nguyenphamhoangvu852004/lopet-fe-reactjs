import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { PetProvider } from "./context/PetContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* Danh sách thú cưng nạp bằng token của phiên nên phải nằm trong
            AuthProvider; đặt ngoài RealtimeProvider vì socket không phụ thuộc
            con vật đang chọn. */}
        <PetProvider>
          {/* Socket cần token của phiên nên phải nằm trong AuthProvider */}
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </PetProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
