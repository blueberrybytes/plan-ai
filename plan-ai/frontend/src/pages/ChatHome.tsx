import React from "react";
import SidebarLayout from "../components/layout/SidebarLayout";
import HomeTour from "../components/onboarding/HomeTour";
import AssistantChatPanel from "../components/chat/AssistantChatPanel";

const ChatHome: React.FC = () => {
  return (
    <SidebarLayout fullHeight>
      <HomeTour />
      <AssistantChatPanel storageKey="redux:chatHome" />
    </SidebarLayout>
  );
};

export default ChatHome;
