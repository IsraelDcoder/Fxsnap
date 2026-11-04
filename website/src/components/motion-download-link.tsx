"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function MotionDownloadLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.a
      className={className}
      href={href}
      rel="noreferrer"
      target="_blank"
      transition={{ duration: 0.16, ease: "easeOut" }}
      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      {children}
    </motion.a>
  );
}
