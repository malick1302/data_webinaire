"use client";

import { useEffect, useRef } from "react";

type GoogleSignInProps = {
  clientId: string;
  onCredential: (credential: string) => void;
};

export function GoogleSignIn({ clientId, onCredential }: GoogleSignInProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (cancelled || !window.google?.accounts.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredentialRef.current(response.credential),
        auto_select: true,
        cancel_on_tap_outside: false,
        itp_support: true,
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.prompt();
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 320,
      });
    };
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.remove();
    };
  }, [clientId]);

  return <div ref={buttonRef} />;
}
