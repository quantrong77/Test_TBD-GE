import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

let lightbox: PhotoSwipeLightbox | null = null;

/** Gắn trình xem pinch-zoom cho mọi [data-gallery] trong #app (gọi lại sau mỗi lần render). */
export function bindViewer(root: HTMLElement = document.getElementById('app')!) {
  lightbox?.destroy();
  if (!root.querySelector('[data-gallery] a')) {
    lightbox = null;
    return;
  }
  lightbox = new PhotoSwipeLightbox({
    gallery: '#app [data-gallery]',
    children: 'a',
    pswpModule: () => import('photoswipe'),
    wheelToZoom: true,
    initialZoomLevel: 'fit',
    secondaryZoomLevel: 2,
    maxZoomLevel: 6,
    bgOpacity: 0.95,
    closeTitle: 'Đóng',
    zoomTitle: 'Phóng to',
    arrowPrevTitle: 'Ảnh trước',
    arrowNextTitle: 'Ảnh sau',
    errorMsg: 'Không tải được ảnh',
  });
  lightbox.on('uiRegister', () => {
    lightbox!.pswp!.ui!.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el, pswp) => {
        el.style.cssText =
          'position:absolute;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(0,0,0,.65);color:#fff;font-size:15px;text-align:center';
        pswp.on('change', () => {
          const a = pswp.currSlide?.data.element as HTMLElement | undefined;
          el.textContent = a?.dataset.caption ?? '';
        });
      },
    });
  });
  lightbox.init();
}
