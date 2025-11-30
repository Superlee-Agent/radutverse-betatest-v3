import React, { useState, forwardRef, useImperativeHandle } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { StoryClient, WIP_TOKEN_ADDRESS } from "@story-protocol/core-sdk";
import { createWalletClient, custom, parseEther, http, type Account } from "viem";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { keccakOfJson } from "@/lib/utils/crypto";
import { Address } from "viem";

// --- KONSTANTA ---
const OFFCHAIN_LICENSE_TERMS_URI =
  "https://github.com/piplabs/pil-document/blob/998c13e6ee1d04eb817aefd1fe16dfe8be3cd7a2/off-chain-terms/NCSR.json";

// --- INTERFACE YANG LEBIH AKURAT ---

interface ParentLicense {
  licenseTermsId: string;
  terms?: {
    commercialUse: boolean;
    commercialRevShare: number; // Nilai terskala (misal, 5000000 untuk 5%)
    [key: string]: any;
  };
}

interface ParentAsset {
  ipId: Address; // Menggunakan tipe Address dari viem
  title?: string;
  licenses?: ParentLicense[];
}

interface LicensingFormProps {
  imageUrl: string;
  imageName?: string;
  type: "image" | "video";
  demoMode?: boolean;
  isLoading?: boolean;
  onClose?: () => void;
  parentAsset?: ParentAsset;
  onRegisterStart?: (state: {
    status: string;
    progress: number;
    error: any;
  }) => void;
  onRegisterComplete?: (result: { ipId?: Address; txHash?: Address }) => void;
}

// --- KOMPONEN UTAMA ---

const LicensingFormComponent = (
  {
    imageUrl,
    imageName = "generated-image.png",
    type,
    demoMode = false,
    isLoading = false,
    onClose,
    parentAsset,
    onRegisterStart,
    onRegisterComplete,
  }: LicensingFormProps,
  ref: any,
) => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  // State
  const [title, setTitle] = useState("AI Generated Image");
  const [description, setDescription] = useState(
    "Created using AI image generation technology",
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [registeredIpId, setRegisteredIpId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<
    "idle" | "registering-derivative" | "claiming-revenue" | "success"
  >("idle");

  // Expose handleRegister to parent component via ref
  useImperativeHandle(ref, () => ({
    handleRegister,
  }));

  // Kalkulasi & Validasi Awal
  const isPaidRemix =
    parentAsset && parentAsset.licenses && parentAsset.licenses.length > 0;
  const parentLicense: ParentLicense | undefined = isPaidRemix
    ? parentAsset.licenses.find((l) => l.terms?.commercialUse === true)
    : undefined;

  const parentRevShareScaled = parentLicense?.terms?.commercialRevShare ?? 0;
  // Nilai untuk tampilan (0-100)
  const parentRevSharePercentage = Number(parentRevShareScaled) / 1000000;

  // --- FUNGSI UTAMA ---

  const handleConvertImageToFile = async (): Promise<File> => {
    // ... (Logika konversi dipertahankan karena sudah benar)
    if (!imageUrl) {
      throw new Error("No image URL available");
    }

    let blob: Blob;

    if (imageUrl.startsWith("data:")) {
      const [header, data] = imageUrl.split(",");
      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: mimeType });
    } else if (imageUrl.startsWith("blob:")) {
      const response = await fetch(imageUrl);
      blob = await response.blob();
    } else {
      const response = await fetch(imageUrl);
      blob = await response.blob();
    }

    return new File([blob], imageName, {
      type: blob.type || "image/png",
    });
  };

  const handleRegister = async () => {
    // --- 1. PRE-CHECK VALIDASI ---
    if (!imageUrl) return setRegisterError("No image to register");
    if (!isPaidRemix || !parentAsset)
      return setRegisterError("Parent asset data required for licensing");
    if (!parentLicense)
      return setRegisterError("No commercial license found on parent IP");
    if (!demoMode && !authenticated)
      return setRegisterError("Please connect wallet or enable demo mode");

    setIsRegistering(true);
    setRegisterError(null);
    setRegisterSuccess(false);

    let addr: Address | undefined;
    let childIpId: Address | undefined;

    try {
      // --- 2. SETUP WALLET & CLIENT ---
      let ethProvider: any = undefined;
      if (!demoMode && wallets && wallets.length > 0) {
        try {
          const wallet = wallets[0];
          if (typeof wallet.getEthereumProvider === "function") {
            ethProvider = await wallet.getEthereumProvider();
          }
        } catch (err) {
          console.warn("Failed to get ethereum provider:", err);
        }
      }

      if (ethProvider) {
        try {
          const walletClient = createWalletClient({
            transport: custom(ethProvider),
          });
          const [a] = await walletClient.getAddresses();
          if (a) addr = a;
        } catch (err) {
          console.warn("Failed to get wallet address from provider:", err);
        }
      }

      if (!addr) {
        try {
          const guestPk = (import.meta as any).env?.VITE_GUEST_PRIVATE_KEY;
          if (guestPk) {
            const normalized = String(guestPk).startsWith("0x")
              ? String(guestPk)
              : `0x${String(guestPk)}`;
            const guestAccount = privateKeyToAccount(
              normalized as `0x${string}`,
            );
            addr = guestAccount.address;
          }
        } catch (err) {
          console.warn("Failed to create guest account:", err);
        }
      }

      if (!addr) throw new Error("Could not determine wallet address");

      const rpcUrl = (import.meta as any).env?.VITE_PUBLIC_STORY_RPC;
      if (!rpcUrl) throw new Error("RPC URL not set");

      let storyClient: StoryClient;
      if (ethProvider) {
        // Create wallet client to use wallet's signing methods
        const walletClient = createWalletClient({
          transport: custom(ethProvider),
        });

        // Create a custom account that delegates signing to the wallet client
        const walletAccount = toAccount({
          address: addr as `0x${string}`,
          async signMessage({ message }) {
            const messageParam = typeof message === 'string'
              ? message
              : 'raw' in message && message.raw instanceof Uint8Array
              ? { raw: message.raw as `0x${string}` }
              : message;

            return await walletClient.signMessage({
              account: addr as `0x${string}`,
              message: messageParam,
            } as any);
          },
          async signTransaction(transaction) {
            return await walletClient.signTransaction(
              transaction as any,
            );
          },
          async signTypedData(typedData) {
            return await walletClient.signTypedData({
              account: addr as `0x${string}`,
              domain: typedData.domain as any,
              types: typedData.types as any,
              primaryType: typedData.primaryType as any,
              message: typedData.message as any,
            } as any);
          },
        });

        storyClient = StoryClient.newClient({
          account: walletAccount,
          transport: custom(ethProvider),
          chainId: 1514,
        });
      } else {
        const guestPk = (import.meta as any).env?.VITE_GUEST_PRIVATE_KEY;
        if (!guestPk) throw new Error("Guest key not configured");
        const normalized = String(guestPk).startsWith("0x")
          ? String(guestPk)
          : `0x${String(guestPk)}`;
        const guestAccount = privateKeyToAccount(normalized as `0x${string}`);
        storyClient = StoryClient.newClient({
          account: guestAccount,
          transport: http(rpcUrl),
          chainId: 1514,
        });
      }

      const file = await handleConvertImageToFile();

      // Upload image to IPFS
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Failed to upload image to IPFS");
      const { url: imageUri } = await uploadRes.json();

      const spg = (import.meta as any).env?.VITE_PUBLIC_SPG_COLLECTION;
      if (!spg) throw new Error("SPG collection not configured");

      const ipMetadataObj = {
        title: title || "AI Generated Image",
        description:
          description || "Created using AI image generation technology",
        ipType: "Image",
        createdAt: new Date().toISOString(),
        mediaUrl: imageUri,
      };

      const nftMetadataObj = {
        title: title || "AI Generated Image",
        description:
          description || "Created using AI image generation technology",
        image: imageUri,
        attributes: [
          { trait_type: "Type", value: "AI Generated Derivative" },
          { trait_type: "Parent IP", value: parentAsset.ipId },
        ],
      };

      const ipMetadataHash = keccakOfJson(ipMetadataObj);
      const nftMetadataHash = keccakOfJson(nftMetadataObj);

      // Upload IP metadata JSON to IPFS
      const ipMetadataFormData = new FormData();
      ipMetadataFormData.append(
        "file",
        new Blob([JSON.stringify(ipMetadataObj)], { type: "application/json" }),
        "ip-metadata.json",
      );
      const ipMetadataUploadRes = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: ipMetadataFormData,
      });

      if (!ipMetadataUploadRes.ok)
        throw new Error("Failed to upload IP metadata to IPFS");
      const { url: ipMetadataUri } = await ipMetadataUploadRes.json();

      // Upload NFT metadata JSON to IPFS
      const nftMetadataFormData = new FormData();
      nftMetadataFormData.append(
        "file",
        new Blob([JSON.stringify(nftMetadataObj)], {
          type: "application/json",
        }),
        "nft-metadata.json",
      );
      const nftMetadataUploadRes = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: nftMetadataFormData,
      });

      if (!nftMetadataUploadRes.ok)
        throw new Error("Failed to upload NFT metadata to IPFS");
      const { url: nftMetadataUri } = await nftMetadataUploadRes.json();

      // ========================================
      // STEP 1: REGISTER DERIVATIVE IP ASSET (Combined operation)
      // ========================================
      console.log("📝 Step 1: Registering derivative IP asset...");
      setCurrentStep("registering-derivative");
      onRegisterStart &&
        onRegisterStart({
          status: "Registering derivative IP asset...",
          progress: 50,
          error: null,
        });

      try {
        const derivativeResponse =
          await storyClient.ipAsset.registerDerivativeIpAsset({
            nft: { type: "mint", spgNftContract: spg as Address },
            derivData: {
              parentIpIds: [parentAsset.ipId],
              licenseTermsIds: [BigInt(parentLicense.licenseTermsId)],
            },
            ipMetadata: {
              ipMetadataURI: ipMetadataUri,
              ipMetadataHash: ipMetadataHash as `0x${string}`,
              nftMetadataURI: nftMetadataUri,
              nftMetadataHash: nftMetadataHash as `0x${string}`,
            },
            licenseDocument: {
              uri: OFFCHAIN_LICENSE_TERMS_URI,
            },
            txOptions: { waitForTransaction: true },
          });

        childIpId = derivativeResponse.ipId as Address;
        console.log("✅ Derivative IP asset registered:", childIpId);
        console.log("📋 Metadata URIs:", { ipMetadataUri, nftMetadataUri });
      } catch (registerError: any) {
        console.error(
          "❌ Register derivative error:",
          registerError?.message || registerError,
        );
        throw new Error(
          `Failed to register derivative IP: ${registerError?.message || String(registerError)}`,
        );
      }

      // ========================================
      // STEP 2: PARENT CLAIMS REVENUE
      // ========================================
      console.log("💰 Step 2: Parent claiming revenue...");
      setCurrentStep("claiming-revenue");
      onRegisterStart &&
        onRegisterStart({
          status: "Parent claiming revenue...",
          progress: 85,
          error: null,
        });

      try {
        const revenueResponse = await storyClient.royalty.claimAllRevenue({
          ancestorIpId: parentAsset.ipId,
          claimer: parentAsset.ipId,
          currencyTokens: [WIP_TOKEN_ADDRESS],
          childIpIds: childIpId ? [childIpId] : [],
          royaltyPolicies: [],
          txOptions: { waitForTransaction: true },
        });

        console.log(
          "✅ Parent claimed revenue:",
          revenueResponse.claimedTokens,
        );
      } catch (revenueError: any) {
        console.warn(
          "⚠️ Revenue claiming encountered an issue (non-critical):",
          revenueError?.message,
        );
      }

      // --- FINALIZE ---
      setCurrentStep("success");
      setRegisteredIpId(childIpId || "pending");
      setRegisterSuccess(true);
      setSuccessMessage(
        demoMode
          ? `✅ Derivative registered! Child IP: ${childIpId}`
          : `✅ Derivative registered with ${parentRevSharePercentage.toFixed(2)}% revenue share. Child IP: ${childIpId}`,
      );

      if (onRegisterComplete) {
        onRegisterComplete({
          ipId: childIpId as Address,
          txHash: childIpId as Address,
        });
      }
    } catch (error: any) {
      const errorMsg = error?.message || error?.data?.message || String(error);
      setRegisterError(errorMsg);
      console.error("❌ Full registration error:", {
        message: errorMsg,
        error,
        stack: error?.stack,
      });
      // Set step kembali ke idle setelah error agar user bisa mencoba lagi
      setCurrentStep("idle");
    } finally {
      setIsRegistering(false);
    }
  };

  // --- RENDERING (UI dipertahankan karena sudah baik) ---
  return (
    <div className="w-full h-full p-6 space-y-4 flex flex-col">
      {/* Success Message */}
      {registerSuccess && (
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
                Registration Successful!
              </h4>
              <p className="text-xs text-slate-400 mb-2">{successMessage}</p>
              {registeredIpId && registeredIpId !== "pending" && (
                <a
                  href={`https://explorer.story.foundation/ipa/${registeredIpId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  View on Explorer
                  <svg
                    className="w-3.5 h-3.5"
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

      <div className="flex items-center justify-between border-b border-slate-800/50 pb-4">
        <h3 className="text-xl font-semibold text-[#FF4DA6]">
          {registerSuccess
            ? "Derivative Registered"
            : "License & Register Derivative"}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
            type="button"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        )}
      </div>

      {/* Parent Asset Info */}
      {isPaidRemix && parentAsset && (
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">
            Parent IP
          </p>
          <p className="text-sm text-slate-200 font-semibold mb-1">
            {parentAsset.title || "Untitled"}
          </p>
          <p className="text-xs text-slate-400 font-mono break-all">
            {parentAsset.ipId}
          </p>
          {parentLicense && (
            <div className="mt-3 pt-3 border-t border-slate-700/30 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">License Terms ID:</span>
                <span className="text-slate-300 font-mono">
                  {parentLicense.licenseTermsId}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Revenue Share:</span>
                <span className="text-slate-300 font-semibold">
                  {parentRevSharePercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Off-Chain License Terms */}
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">
          Off-Chain License Terms
        </p>
        <a
          href={OFFCHAIN_LICENSE_TERMS_URI}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors break-all"
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
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
          NCSR.json
        </a>
      </div>

      {/* Form Content */}
      <div className="space-y-4 flex-1 overflow-y-auto pr-1 px-0.5 py-2">
        {/* Title Input */}
        <div className="space-y-2">
          <label className="text-sm text-slate-400 font-medium">
            Child IP Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isRegistering || registerSuccess}
            className="w-full rounded-lg px-4 py-2.5 bg-slate-800/30 border border-slate-700/50 text-slate-100 text-sm placeholder-slate-500 disabled:opacity-50 transition-colors focus:outline-none focus:border-[#FF4DA6] focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-[#FF4DA6]/40"
            placeholder="Enter child IP title"
          />
        </div>

        {/* Description Input */}
        <div className="space-y-2">
          <label className="text-sm text-slate-400 font-medium">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isRegistering || registerSuccess}
            className="w-full rounded-lg px-4 py-2.5 bg-slate-800/30 border border-slate-700/50 text-slate-100 text-sm placeholder-slate-500 resize-none disabled:opacity-50 transition-colors focus:outline-none focus:border-[#FF4DA6] focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-[#FF4DA6]/40 leading-relaxed"
            rows={2}
            placeholder="Describe your derivative work"
          />
        </div>

        {/* Revenue Share - Read-only, follows parent */}
        {isPaidRemix && (
          <div className="space-y-2">
            <label className="text-sm text-slate-400 font-medium">
              Revenue Share % (from parent IP)
            </label>
            <div className="w-full rounded-lg px-4 py-2.5 bg-slate-800/30 border border-slate-700/50 text-slate-100 text-sm flex items-center justify-between">
              <span className="font-semibold">
                {parentRevSharePercentage.toFixed(2)}%
              </span>
              <span className="text-xs text-slate-400">
                Inherited from parent
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Child IP revenue share must match parent IP's revenue share
              (scaled value: {parentRevShareScaled}).
            </p>
          </div>
        )}
      </div>

      {/* Status Messages */}
      <div className="space-y-2 pt-3 border-t border-slate-800/50">
        {/* Registration Status */}
        {currentStep !== "idle" && currentStep !== "success" && (
          <div className="rounded-lg px-3 py-2.5 bg-blue-500/10 border border-blue-500/30 text-sm text-blue-400 flex items-center gap-2">
            <span className="inline-block animate-spin">⚙️</span>
            <span className="capitalize">
              {currentStep === "registering-derivative"
                ? "Registering derivative IP asset..."
                : "Claiming parent revenue..."}
            </span>
          </div>
        )}

        {/* Error Message */}
        {registerError && (
          <div className="rounded-lg px-3 py-2.5 bg-red-500/10 border border-red-500/30 text-sm text-red-400 max-h-24 overflow-y-auto">
            {registerError}
          </div>
        )}

        {/* Auth Status */}
        {!demoMode && !authenticated && (
          <div className="rounded-lg px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 text-sm text-amber-400">
            ⚠️ Connect wallet to register
          </div>
        )}

        {demoMode && (
          <div className="rounded-lg px-3 py-2.5 bg-slate-600/20 border border-slate-600/40 text-sm text-slate-400">
            🎭 Demo mode enabled
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-3 border-t border-slate-800/50">
        {registerSuccess ? (
          <>
            {registeredIpId && registeredIpId !== "pending" && (
              <a
                href={`https://explorer.story.foundation/ipa/${registeredIpId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg bg-emerald-600/20 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center justify-center gap-2 border border-emerald-500/30"
              >
                <svg
                  className="w-4 h-4"
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
                Explorer
              </a>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className={`${registeredIpId && registeredIpId !== "pending" ? "flex-1" : "w-full"} rounded-lg bg-slate-700/40 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700/60 transition-colors border border-slate-600/40`}
                type="button"
              >
                Close
              </button>
            )}
          </>
        ) : (
          <button
            onClick={handleRegister}
            disabled={
              isRegistering ||
              currentStep !== "idle" ||
              (!demoMode && !authenticated) ||
              isLoading ||
              !imageUrl ||
              !isPaidRemix
            }
            className="w-full rounded-lg bg-[#FF4DA6]/20 px-4 py-2.5 text-sm font-semibold text-[#FF4DA6] hover:bg-[#FF4DA6]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-[#FF4DA6]/30"
            type="button"
            title={
              isPaidRemix
                ? `Register with ${parentRevSharePercentage.toFixed(2)}% revenue share from parent`
                : "Select a parent asset to enable licensing"
            }
          >
            {isRegistering
              ? `Registering... (${currentStep})`
              : `Register Derivative (${parentRevSharePercentage.toFixed(2)}% Share)`}
          </button>
        )}
      </div>
    </div>
  );
};

const LicensingForm = forwardRef(LicensingFormComponent);
export default LicensingForm;
