import React from "react";
import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";

const MicrosoftIcon: React.FC<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 21 21">
      <path fill="#f25022" d="M0 0h10v10H0z" />
      <path fill="#7fba00" d="M11 0h10v10H11z" />
      <path fill="#00a4ef" d="M0 11h10v10H0z" />
      <path fill="#ffb900" d="M11 11h10v10H11z" />
    </SvgIcon>
  );
};

export default MicrosoftIcon;
