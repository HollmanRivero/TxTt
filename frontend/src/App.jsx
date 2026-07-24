import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth"; // Sjekk at stien til AuthProvider stemmer med mappen din
import { CallProvider } from "./components/CallProvider";
import Conversations from "./pages/Conversations";
import ChatRoom from "./pages/ChatRoom";
import CallRoom from "./pages/CallRoom";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CallProvider>
          <Routes>
            <Route path="/" element={<Conversations />} />
            <Route path="/chat/:conversationId" element={<ChatRoom />} />
            <Route path="/call/:conversationId" element={<CallRoom />} />
          </Routes>
        </CallProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}