// Bổ sung API cho trình duyệt cũ / trình duyệt nhúng (Zalo, Facebook trên Android có WebView lâu không cập nhật).
// Phải là import ĐẦU TIÊN của main.ts. Cú pháp mới đã được hạ cấp lúc build (vite.config.ts → build.target).
/* eslint-disable no-extend-native */

// Element.replaceChildren – router dùng; Chrome 86 / Safari 14
if (typeof Element !== 'undefined' && !('replaceChildren' in Element.prototype)) {
  (Element.prototype as unknown as { replaceChildren: (...n: (Node | string)[]) => void }).replaceChildren = function (this: Element, ...nodes: (Node | string)[]) {
    while (this.lastChild) this.removeChild(this.lastChild);
    this.append(...nodes);
  };
}

// Array/String.prototype.at – thư viện xuất PDF dùng; Chrome 92 / Safari 15.4
for (const P of [Array.prototype, String.prototype] as { at?: unknown }[]) {
  if (!P.at) {
    Object.defineProperty(P, 'at', {
      configurable: true,
      writable: true,
      value: function (this: ArrayLike<unknown>, i: number) {
        const n = Math.trunc(i) || 0;
        return this[n < 0 ? this.length + n : n];
      },
    });
  }
}

// Object.hasOwn – Chrome 93 / Safari 15.4
if (!(Object as { hasOwn?: unknown }).hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true,
    writable: true,
    value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k),
  });
}

export {};
