export type LoaderSize = "xs" | "sm" | "md" | "lg";

export type LoaderProps = {
  size?: LoaderSize;
  tone?: "onLight" | "onDark";
  label?: string;
  className?: string;
};
