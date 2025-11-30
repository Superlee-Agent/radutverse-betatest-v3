import { useState, useRef, Dispatch, SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LicensingForm from "./LicensingForm";

interface CompactResultCardProps {
  imageUrl: string;
  type: "image" | "video";
  isLoading: boolean;
  onDownload: () => void;
  onShare: () => void;
  onUpscale?: () => void;
  onCreateAnother: () => void;
  isExpanded?: boolean;
  setIsExpanded?: Dispatch<SetStateAction<boolean>>;
  demoMode?: boolean;
  parentAsset?: any;
  originalUrl?: string;
}

const CompactResultCard = ({
  imageUrl,
  type,
  isLoading,
  onDownload,
  onShare,
  onUpscale,
  onCreateAnother,
  isExpanded: externalIsExpanded = false,
  setIsExpanded: externalSetIsExpanded,
  demoMode = false,
  parentAsset,
  originalUrl,
}: CompactResultCardProps) => {
  const [localIsExpanded, setLocalIsExpanded] = useState(false);
  const isExpanded = externalSetIsExpanded
    ? externalIsExpanded
    : localIsExpanded;
  const setIsExpanded = externalSetIsExpanded || setLocalIsExpanded;
  const [registrationState, setRegistrationState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const [registeredIpId, setRegisteredIpId] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string>(imageUrl);
  const licensingFormRef = useRef<any>(null);

  const handleLicenseClick = () => {
    if (!parentAsset) {
      setRegistrationError("Parent asset data required for licensing");
      setRegistrationState("error");
      return;
    }

    setRegistrationState("loading");
    setRegistrationError(null);
    setRegisteredIpId(null);

    if (licensingFormRef.current?.handleRegister) {
      licensingFormRef.current.handleRegister();
    }
  };

  const handleRegistrationComplete = (result: {
    ipId?: string;
    txHash?: string;
  }) => {
    if (result.ipId) {
      setRegisteredIpId(result.ipId);
    }
    // Display clean image (original URL) after successful registration
    if (originalUrl) {
      setDisplayUrl(originalUrl);
    }
    setRegistrationState("success");
  };

  if (isExpanded) {
    return (
      <motion.div
        key="expanded"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-screen h-screen fixed inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-6 z-50"
      >
        {/* Large Image Container - Responsive */}
        <motion.div
          className="relative rounded-lg overflow-hidden bg-black border-2 border-[#FF4DA6]/50 shadow-lg flex items-center justify-center w-full max-w-md sm:max-w-2xl h-full max-h-[70vh] sm:max-h-[80vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-full h-full flex items-center justify-center">
            {type === "image" ? (
              <img
                src={displayUrl}
                alt="Generation result"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                src={displayUrl}
                className="w-full h-full object-contain"
                controls
              />
            )}
          </div>

          {/* Type Badge */}
          <div className="absolute top-3 right-3 text-xs font-medium bg-slate-900/80 text-slate-300 px-2 py-1 rounded">
            {type === "image" ? "🖼" : "🎬"}
          </div>

          {/* Close Button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-4 left-4 p-2 rounded-full bg-black/70 hover:bg-black/90 transition-colors"
            type="button"
            aria-label="Close expanded view"
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Notification Overlay */}
          <AnimatePresence>
            {registrationState !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-6 left-6 right-6 max-w-sm"
              >
                {registrationState === "loading" && (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4 flex items-center gap-3">
                    <div className="inline-block animate-spin">
                      <svg
                        className="w-5 h-5 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-blue-400">
                        Registering derivative IP...
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Please wait, this may take a moment
                      </p>
                    </div>
                  </div>
                )}

                {registrationState === "success" && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-emerald-400 mb-1">
                          Derivative Registered!
                        </h4>
                        <p className="text-xs text-slate-300 mb-2">
                          🔓 You can now preview this image without watermark
                          protection.
                        </p>
                        {registeredIpId && registeredIpId !== "pending" && (
                          <a
                            href={`https://explorer.story.foundation/ipa/${registeredIpId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                          >
                            View on Explorer
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {registrationState === "error" && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-red-400 mb-1">
                          Registration Failed
                        </h4>
                        <p className="text-xs text-slate-300 break-words">
                          {registrationError}
                        </p>
                        <button
                          onClick={() => setRegistrationState("idle")}
                          className="mt-2 text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Action Buttons - Mobile Responsive Layout */}
        <motion.div
          className="absolute bottom-4 sm:bottom-6 left-0 right-0 flex flex-wrap gap-1.5 sm:gap-2 justify-center flex-shrink-0 px-4 sm:px-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <button
            onClick={onDownload}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-md bg-[#FF4DA6] hover:bg-[#FF4DA6]/80 text-white font-medium transition-colors flex items-center justify-center gap-1 text-xs sm:text-sm whitespace-nowrap"
            title="Download"
          >
            <svg
              className="w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>Download</span>
          </button>

          <button
            onClick={onShare}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium transition-colors flex items-center justify-center gap-1 text-xs sm:text-sm whitespace-nowrap"
            title="Share"
          >
            <svg
              className="w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C9.589 12.881 10.647 12.5 12 12.5c1.353 0 2.411.381 3.316.842M9 6a3 3 0 110-6 3 3 0 010 6zM9 6h.01M15 20c0 1.105-.895 2-2 2s-2-.895-2-2m0 0c0 1.105-.895 2-2 2s-2-.895-2-2m0 0c0-5.39 4.478-9.75 10-9.75s10 4.36 10 9.75"
              />
            </svg>
            <span>Share</span>
          </button>

          {onUpscale && type === "image" && (
            <button
              onClick={onUpscale}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium transition-colors flex items-center justify-center gap-1 text-xs sm:text-sm whitespace-nowrap"
              title="Upscale"
            >
              <svg
                className="w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4V20m6-4v4m0-12l4-4m-4 4l-4-4"
                />
              </svg>
              <span>Upscale</span>
            </button>
          )}

          <button
            onClick={handleLicenseClick}
            disabled={registrationState === "loading"}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-md bg-[#FF4DA6]/20 hover:bg-[#FF4DA6]/30 disabled:opacity-50 disabled:cursor-not-allowed text-[#FF4DA6] font-medium transition-colors flex items-center justify-center gap-1 text-xs sm:text-sm whitespace-nowrap border border-[#FF4DA6]/30"
            title="Get no watermark images"
          >
            {registrationState === "loading" ? (
              <>
                <span className="inline-block animate-spin">⚙️</span>
                <span>Registering...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Get no watermark images</span>
              </>
            )}
          </button>

          {/* Hidden Licensing Form for background processing */}
          {parentAsset && (
            <div style={{ display: "none" }}>
              <LicensingForm
                ref={licensingFormRef}
                imageUrl={imageUrl}
                type={type}
                demoMode={demoMode}
                isLoading={isLoading}
                parentAsset={parentAsset}
                onRegisterStart={(state) => {
                  console.log("Registration started:", state);
                }}
                onRegisterComplete={handleRegistrationComplete}
              />
            </div>
          )}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="compact"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={() => setIsExpanded(true)}
      className="relative w-40 h-40 rounded-lg overflow-hidden bg-black border-2 border-[#FF4DA6]/50 shadow-lg group cursor-pointer hover:border-[#FF4DA6] hover:shadow-lg hover:shadow-[#FF4DA6]/20 transition-all"
    >
      {type === "image" ? (
        <img
          src={displayUrl}
          alt="Generation result"
          className="w-full h-full object-cover"
        />
      ) : (
        <video src={displayUrl} className="w-full h-full object-cover" />
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
        <p className="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </p>
      </div>

      {/* Type Badge */}
      <div className="absolute top-1 right-1 text-xs font-medium bg-slate-900/80 text-slate-300 px-2 py-1 rounded">
        {type === "image" ? "🖼" : "🎬"}
      </div>
    </motion.div>
  );
};

export default CompactResultCard;
