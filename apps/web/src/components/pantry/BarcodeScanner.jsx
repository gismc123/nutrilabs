import { useEffect, useRef, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import BottomSheet from '../ui/BottomSheet.jsx';

export default function BarcodeScanner({ isOpen, onScan, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setError(null);
      setManualBarcode('');
      return;
    }
    if (isMobile) startCamera();
  }, [isOpen, isMobile]);

  async function startCamera() {
    setError(null);
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          stopCamera();
          onScan(result.getText());
        }
      });
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowed')) {
        setError('Camera access denied — please allow camera access in your browser settings.');
      } else {
        setError('Camera scanning is not supported in this browser.');
      }
      setScanning(false);
    }
  }

  function stopCamera() {
    try {
      readerRef.current?.reset();
    } catch {}
    readerRef.current = null;
    setScanning(false);
  }

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Scan barcode">
      <div className="space-y-4">
        {isMobile && !error ? (
          <>
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ paddingBottom: '100%' }}>
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-48 h-48">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                </div>
              </div>
            </div>
            {scanning && (
              <p className="text-center text-sm text-neutral-500">Scanning…</p>
            )}
          </>
        ) : null}

        {error && (
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-3">
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {(!isMobile || error) && (
          <div>
            <p className="text-sm text-neutral-500 mb-3">
              {isMobile
                ? 'Enter the barcode number manually:'
                : 'Enter a barcode number below. Camera scanning works best on mobile.'}
            </p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="e.g. 0123456789012"
                className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <button
                type="submit"
                disabled={!manualBarcode.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Look up
              </button>
            </form>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-700 border border-neutral-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
