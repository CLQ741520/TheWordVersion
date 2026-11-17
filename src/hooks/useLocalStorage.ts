import { useEffect, useState } from "react";

/** 读写 localStorage 的状态 hook，读写失败时回退到默认值 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initialValue : (JSON.parse(stored) as T);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 隐私模式或配额不足时忽略，不影响页面使用
    }
  }, [key, value]);

  return [value, setValue] as const;
}
