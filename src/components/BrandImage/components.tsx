"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { Loader } from "@/components/Loader/components";
import type { LoaderSize } from "@/components/Loader/types";

type CommonProps = {
  src: string;
  alt: string;
  className?: string;
  quality?: number;
  loaderSize?: LoaderSize;
  fallback?: React.ReactNode;
  priority?: boolean;
  sizes?: string;
  lazy?: boolean;
};

type SizedProps = CommonProps & {
  fill?: false;
  width: number;
  height: number;
};

type FillProps = CommonProps & {
  fill: true;
  width?: never;
  height?: never;
};

export type BrandImageProps = SizedProps | FillProps;

export function BrandImage(props: BrandImageProps) {
  const {
    src,
    alt,
    className,
    quality = 90,
    loaderSize = "sm",
    fallback,
    priority,
    sizes,
    lazy = true,
  } = props;

  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored && fallback !== undefined) {
    return <>{fallback}</>;
  }

  const commonImageProps: Partial<ImageProps> = {
    src,
    alt,
    quality,
    priority,
    sizes,
    loading: priority ? undefined : lazy ? "lazy" : "eager",
    onLoad: () => setLoaded(true),
    onError: () => setErrored(true),
    className: [
      "transition-opacity duration-300",
      loaded ? "opacity-100" : "opacity-0",
      className ?? "",
    ].join(" "),
  };

  return (
    <>
      {!loaded && !errored && (
        <div className="absolute inset-0 grid place-items-center bg-bg-deep z-0">
          <Loader size={loaderSize} />
        </div>
      )}
      {props.fill ? (
        <Image {...(commonImageProps as ImageProps)} fill />
      ) : (
        <Image
          {...(commonImageProps as ImageProps)}
          width={props.width}
          height={props.height}
        />
      )}
    </>
  );
}
