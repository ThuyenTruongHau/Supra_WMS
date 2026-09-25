const OPERATION_GUIDE_PDF_URL = "/docs/huong-dan-van-hanh-vcc1.pdf";

export default function QrTabletHelpButton() {
  const openGuide = () => {
    window.open(OPERATION_GUIDE_PDF_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={openGuide}
      title="Tài liệu hướng dẫn vận hành VCC"
      aria-label="Tài liệu hướng dẫn vận hành VCC"
      className="fixed bottom-5 right-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-xl font-bold text-white shadow-lg shadow-brand-primary/30 transition hover:bg-brand-primary/90 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
    >
      !
    </button>
  );
}
