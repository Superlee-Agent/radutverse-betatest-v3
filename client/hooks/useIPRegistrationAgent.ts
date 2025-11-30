import { useCallback, useState } from "react";
import { sha256HexOfFile, keccakOfJson } from "@/lib/utils/crypto";
import {
  uploadFile,
  uploadJSON,
  extractCid,
  toIpfsUri,
  toHttps,
} from "@/lib/utils/ipfs";
import { calculateFileHash } from "@/lib/utils/hash";
import {
  StoryClient,
  PILFlavor,
  WIP_TOKEN_ADDRESS,
} from "@story-protocol/core-sdk";
import {
  createWalletClient,
  custom,
  parseEther,
  http,
  type Account,
} from "viem";
import {
  getLicenseSettingsByGroup,
  requiresSelfieVerification,
  requiresSubmitReview,
  isAiGeneratedGroup,
} from "@/lib/groupLicense";
import { privateKeyToAccount, toAccount } from "viem/accounts";

export type RegisterState = {
  status:
    | "idle"
    | "compressing"
    | "uploading-image"
    | "creating-metadata"
    | "uploading-metadata"
    | "minting"
    | "success"
    | "error";
  progress: number;
  error: any;
  ipId?: string;
  txHash?: string;
};

async function compressImage(file: File): Promise<File> {
  // Simple browser-side downscale to JPEG
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => {
      img.onload = () => {
        const maxW = 1024;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL("image/jpeg", 0.9);
        resolve(url);
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = fr.result as string;
    };
    fr.onerror = () => reject(new Error("File read failed"));
    fr.readAsDataURL(file);
  });
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

export function useIPRegistrationAgent() {
  const [registerState, setRegisterState] = useState<RegisterState>({
    status: "idle",
    progress: 0,
    error: null,
  });

  const executeRegister = useCallback(
    async (
      group: number,
      file: File,
      mintingFee?: number,
      revShare?: number,
      aiTrainingManual?: boolean,
      intent?: { title?: string; prompt?: string },
      ethereumProvider?: any,
    ) => {
      try {
        // ============================================
        // TIER 1: HASH/VISION DETECTION (BLOCKING)
        // ============================================
        // Run vision and hash checks in PARALLEL (not sequential)
        const [visionResult, hashResult] = await Promise.allSettled([
          // Vision-based image detection (most powerful)
          (async () => {
            try {
              const formData = new FormData();
              formData.append("image", file);
              const visionResponse = await fetch(
                "/api/vision-image-detection",
                {
                  method: "POST",
                  body: formData,
                },
              );

              if (visionResponse.ok) {
                const visionCheck = await visionResponse.json();
                if (visionCheck.blocked) {
                  return {
                    blocked: true,
                    message:
                      visionCheck.message ||
                      "Image mirip dengan IP yang sudah terdaftar. Tidak dapat registrasi.",
                  };
                }
              }
              return { blocked: false };
            } catch (visionError) {
              console.warn(
                "Vision-based detection failed, continuing:",
                visionError,
              );
              return { blocked: false };
            }
          })(),
          // Hash whitelist check
          (async () => {
            try {
              const hash = await calculateFileHash(file);
              const hashCheckResponse = await fetch("/api/check-remix-hash", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hash }),
              });

              if (hashCheckResponse.ok) {
                const hashCheck = await hashCheckResponse.json();
                if (hashCheck.found) {
                  return {
                    found: true,
                    ipId: hashCheck.ipId,
                    title: hashCheck.title,
                  };
                }
              }
              return { found: false };
            } catch (hashError) {
              console.warn(
                "Hash whitelist check failed, continuing:",
                hashError,
              );
              return { found: false };
            }
          })(),
        ]);

        // Handle vision detection blocking
        if (
          visionResult.status === "fulfilled" &&
          visionResult.value?.blocked
        ) {
          setRegisterState({
            status: "error",
            progress: 0,
            error: visionResult.value.message,
          });
          return { success: false, reason: "vision_match_found" } as const;
        }

        // Handle hash remix offer
        if (hashResult.status === "fulfilled" && hashResult.value?.found) {
          setRegisterState({
            status: "idle",
            progress: 0,
            error: null,
          });
          return {
            success: false,
            reason: "hash_found_offer_remix",
            matchedIpId: hashResult.value.ipId,
            matchedTitle: hashResult.value.title,
          } as const;
        }

        // ✅ TIER 1 DETECTION COMPLETE
        // Hash/Vision checks passed - image is allowed to proceed

        const licenseSettings = getLicenseSettingsByGroup(
          group,
          aiTrainingManual,
          mintingFee,
          revShare,
        );
        if (requiresSelfieVerification(group)) {
          setRegisterState({
            status: "idle",
            progress: 0,
            error: "Selfie verification required before registration.",
          });
          return { success: false, reason: "selfie_required" } as const;
        }
        if (requiresSubmitReview(group)) {
          setRegisterState({
            status: "idle",
            progress: 0,
            error: "Submit review required.",
          });
          return { success: false, reason: "submit_review" } as const;
        }
        if (!licenseSettings)
          throw new Error("Cannot register: licenseSettings null");

        setRegisterState({ status: "compressing", progress: 10, error: null });
        const compressedFile = await compressImage(file);

        // Parallel: upload image + calculate creator address while compressing
        setRegisterState((p) => ({
          ...p,
          status: "uploading-image",
          progress: 25,
        }));

        const [fileUploadResult, creatorAddr, imageHash] = await Promise.all([
          uploadFile(compressedFile),
          (async () => {
            let addr: string | undefined;
            try {
              const providerTmp: any =
                ethereumProvider || (globalThis as any).ethereum;
              if (providerTmp) {
                const walletClientTmp = createWalletClient({
                  transport: custom(providerTmp),
                });
                const addrs = await walletClientTmp.getAddresses();
                if (addrs && addrs[0]) addr = String(addrs[0]);
              }
            } catch {}
            if (!addr) {
              try {
                const guestPk = (import.meta as any).env
                  ?.VITE_GUEST_PRIVATE_KEY;
                if (guestPk) {
                  const normalized = String(guestPk).startsWith("0x")
                    ? String(guestPk)
                    : `0x${String(guestPk)}`;
                  const guestAccount = privateKeyToAccount(
                    normalized as `0x${string}`,
                  );
                  addr = guestAccount.address;
                }
              } catch {}
            }
            return addr;
          })(),
          sha256HexOfFile(compressedFile),
        ]);

        const imageCid = extractCid(
          fileUploadResult.cid || fileUploadResult.url,
        );
        const imageGateway = fileUploadResult.https || toHttps(imageCid);

        setRegisterState((p) => ({
          ...p,
          status: "creating-metadata",
          progress: 50,
        }));
        const ipMetadata = {
          name: intent?.title || file.name,
          title: intent?.title || file.name,
          description: intent?.prompt || "",
          image: imageGateway,
          imageHash,
          mediaUrl: imageGateway,
          mediaHash: imageHash,
          mediaType: compressedFile.type || "image/jpeg",
          creators: creatorAddr
            ? [
                {
                  name: creatorAddr,
                  address: creatorAddr,
                  contributionPercent: 100,
                },
              ]
            : [],
          attributes: [
            {
              trait_type: "Status",
              value: isAiGeneratedGroup(group)
                ? "AI Generated"
                : "Human Generated",
            },
          ],
          aiMetadata: intent?.prompt
            ? { prompt: intent.prompt, generator: "user", model: "rule-based" }
            : undefined,
          license: licenseSettings,
        };

        setRegisterState((p) => ({
          ...p,
          status: "uploading-metadata",
          progress: 60,
        }));

        // Prepare resources in parallel
        const spg = (import.meta as any).env?.VITE_PUBLIC_SPG_COLLECTION;
        if (!spg)
          throw new Error(
            "SPG collection env not set (VITE_PUBLIC_SPG_COLLECTION)",
          );
        const rpcUrl = (import.meta as any).env?.VITE_PUBLIC_STORY_RPC;
        if (!rpcUrl) throw new Error("RPC URL not set (VITE_PUBLIC_STORY_RPC)");

        // Parallel: upload metadata + initialize wallet client + build license terms
        const [ipMetaUpload, storyClientSetup] = await Promise.all([
          uploadJSON(ipMetadata),
          (async () => {
            const provider = ethereumProvider;
            let addr: string | undefined;
            let story: any;
            let account: Account | undefined;
            if (provider) {
              try {
                const chainIdHex: string = await provider.request({
                  method: "eth_chainId",
                });
                if (chainIdHex?.toLowerCase() !== "0x5ea") {
                  try {
                    await provider.request({
                      method: "wallet_switchEthereumChain",
                      params: [{ chainId: "0x5ea" }],
                    });
                  } catch (e) {
                    try {
                      await provider.request({
                        method: "wallet_addEthereumChain",
                        params: [
                          {
                            chainId: "0x5ea",
                            chainName: "Story",
                            nativeCurrency: {
                              name: "IP",
                              symbol: "IP",
                              decimals: 18,
                            },
                            rpcUrls: rpcUrl
                              ? [rpcUrl]
                              : ["https://mainnet.storyrpc.io"],
                          },
                        ],
                      });
                    } catch {}
                    try {
                      await provider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: "0x5ea" }],
                      });
                    } catch {}
                  }
                }
              } catch {}
              const walletClient = createWalletClient({
                transport: custom(provider),
              });
              const [a] = await walletClient.getAddresses();
              if (!a) throw new Error("No wallet address available");
              addr = a as string;

              // Create a custom account that delegates signing to the wallet client
              account = toAccount({
                address: addr as `0x${string}`,
                async signMessage({ message }) {
                  const messageParam =
                    typeof message === "string"
                      ? message
                      : "raw" in message && message.raw instanceof Uint8Array
                        ? { raw: message.raw as `0x${string}` }
                        : message;

                  return await walletClient.signMessage({
                    account: addr as `0x${string}`,
                    message: messageParam,
                  } as any);
                },
                async signTransaction(transaction) {
                  return await walletClient.signTransaction(transaction as any);
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

              story = StoryClient.newClient({
                account: account,
                transport: custom(provider),
                chainId: 1514,
              });
            } else {
              const guestPk = (import.meta as any).env?.VITE_GUEST_PRIVATE_KEY;
              if (!guestPk)
                throw new Error(
                  "No wallet connected and guest key not configured (VITE_GUEST_PRIVATE_KEY).",
                );
              const normalized = String(guestPk).startsWith("0x")
                ? String(guestPk)
                : `0x${String(guestPk)}`;
              const guestAccount = privateKeyToAccount(
                normalized as `0x${string}`,
              );
              addr = guestAccount.address;
              story = StoryClient.newClient({
                account: guestAccount,
                transport: http(rpcUrl),
                chainId: 1514,
              });
            }
            return { addr, story };
          })(),
        ]);

        const ipMetaCid = extractCid(ipMetaUpload.cid || ipMetaUpload.url);
        const ipMetadataURI = toIpfsUri(ipMetaCid);
        const ipMetadataHash = keccakOfJson(ipMetadata);

        const addr = storyClientSetup.addr;
        const story = storyClientSetup.story;

        // Build license terms for Story SDK
        const licenseTermsData = [
          {
            terms: PILFlavor.commercialRemix({
              commercialRevShare: Number(licenseSettings.revShare) || 0,
              defaultMintingFee: parseEther(
                String(licenseSettings.licensePrice || 0),
              ),
              currency: WIP_TOKEN_ADDRESS,
            }),
          },
        ];

        setRegisterState((p) => ({ ...p, status: "minting", progress: 75 }));

        const result: any =
          await story.ipAsset.mintAndRegisterIpAssetWithPilTerms({
            spgNftContract: spg as `0x${string}`,
            recipient: addr as `0x${string}`,
            licenseTermsData,
            ipMetadata: {
              ipMetadataURI,
              ipMetadataHash: ipMetadataHash as any,
              nftMetadataURI: ipMetadataURI,
              nftMetadataHash: ipMetadataHash as any,
            },
            allowDuplicates: true,
          });

        setRegisterState({
          status: "success",
          progress: 100,
          error: null,
          ipId: result?.ipId,
          txHash: result?.txHash || result?.transactionHash,
        });
        return {
          success: true,
          ipId: result?.ipId,
          txHash: result?.txHash || result?.transactionHash,
          imageUrl: imageGateway,
          ipMetadataUrl: toHttps(ipMetaCid),
        } as const;
      } catch (error: any) {
        const errorMsg =
          error?.message || error?.data?.message || String(error);
        console.error("❌ Registration failed:", {
          message: errorMsg,
          error,
          stack: error?.stack,
        });
        setRegisterState({ status: "error", progress: 0, error: errorMsg });
        return {
          success: false,
          error: errorMsg,
        } as const;
      }
    },
    [],
  );

  const resetRegister = useCallback(() => {
    setRegisterState({ status: "idle", progress: 0, error: null });
  }, []);

  return { registerState, executeRegister, resetRegister } as const;
}
