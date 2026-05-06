import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setNavigate } from "../navigation/navigation";

const NavigationProvider: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  return null; // This component doesn't render anything
};

export default NavigationProvider;
