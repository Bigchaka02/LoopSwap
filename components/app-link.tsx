'use client';

import { forwardRef, type AnchorHTMLAttributes } from 'react';

/**
 * These views load their authoritative data from bootstrap. Native links keep
 * navigation independent of the framework's RSC/prefetch runtime, including
 * keyboard activation, new tabs, downloads, and back/forward navigation.
 */
const AppLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function AppLink(props, ref) {
    return <a ref={ref} {...props} />;
  },
);

export default AppLink;
