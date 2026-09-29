import React from "react";
import type { ExtraProps } from "react-markdown";
import { useTranslation } from "react-i18next";
import { isAllowedImageUrl, isHttpUrl } from "../../utils/safeImageUrl";

// react-markdown also passes the hast `node`; it must not reach the DOM.
type SafeMarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & ExtraProps;

/**
 * Image renderer for untrusted markdown (AI answers, summaries, documents).
 * Images we host are shown. Any other image becomes a plain link, so the browser
 * never sends a request to an unknown host just because a message was displayed.
 */
const SafeMarkdownImage: React.FC<SafeMarkdownImageProps> = ({ node, src, alt, ...rest }) => {
  const { t } = useTranslation();
  void node;

  if (isAllowedImageUrl(src)) {
    return <img src={src} alt={alt ?? ""} {...rest} />;
  }

  const label = alt?.trim() || src || "";
  if (!isHttpUrl(src)) {
    return <span>{label}</span>;
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer nofollow"
      referrerPolicy="no-referrer"
      title={t("common.externalImageBlocked")}
    >
      {label}
    </a>
  );
};

export default SafeMarkdownImage;
