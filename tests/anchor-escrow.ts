import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("anchor-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const connection = provider.connection;
  const program = anchor.workspace.AnchorEscrow as Program<AnchorEscrow>;

  const tokenProgram = TOKEN_PROGRAM_ID;
  const associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID;
  const seed = new BN(randomBytes(8));

  const confirm = async (signature: string): Promise<string> => {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: block.blockhash,
      lastValidBlockHeight: block.lastValidBlockHeight,
    });

    return signature;
  };

  const log = async (signature: string): Promise<string> => {
    if (connection.rpcEndpoint === "https://api.devnet.solana.com") {
      console.log(
        `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=devnet`
      );
    } else {
      console.log(
        `Your transaction signature: https://explorer.solana.com/transaction/${signature}?cluster=custom&customUrl=${connection.rpcEndpoint}`
      );
    }

    return signature;
  };

  let maker = Keypair.generate();
  let taker = Keypair.generate();
  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: any;
  let makerAtaB: any;
  let takerAtaA: any;
  let takerAtaB: any;
  let escrow: PublicKey;
  let vault: PublicKey;

  let accountsPublicKeys: any = {};

  it("setup", async () => {
    await connection.confirmTransaction(
      await connection.requestAirdrop(maker.publicKey, 5 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    console.log("maker balance: ", await connection.getBalance(maker.publicKey) )

    await connection.confirmTransaction(
      await connection.requestAirdrop(taker.publicKey, 5 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    console.log("taker balance: ", await connection.getBalance(taker.publicKey) )


    mintA = await createMint(
      connection,
      maker,
      maker.publicKey,
      null,
      6
    );

    mintB = await createMint(
      connection,
      maker,
      maker.publicKey,
      null,
      6
    );

    escrow = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow", "utf-8"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

    makerAtaA = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      mintA,
      maker.publicKey
    );

    makerAtaB = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      mintB,
      maker.publicKey
    );

    takerAtaA = await getOrCreateAssociatedTokenAccount(
      connection,
      taker,
      mintA,
      taker.publicKey
    );

    takerAtaB = await getOrCreateAssociatedTokenAccount(
      connection,
      taker,
      mintB,
      taker.publicKey
    );

    await mintTo(
      connection,
      maker,
      mintA, // mint
      makerAtaA.address, // destination
      maker.publicKey, // authority
      1000000000,
    );

    await mintTo(
      connection,
      maker,
      mintB, // mint
      takerAtaB.address, // destination
      maker.publicKey, // authority
      1000000000,
    );

    vault = getAssociatedTokenAddressSync(
      mintA,
      escrow,
      true, 
      tokenProgram
    );


    accountsPublicKeys = {
      maker: maker.publicKey,
      taker: taker.publicKey,
      mint_a: mintA,
      mint_b: mintB,
      maker_ata_a: makerAtaA,
      maker_ata_b: makerAtaB,
      taker_ata_a: takerAtaA,
      taker_ata_b: takerAtaB,
      escrow: escrow,
      vault: vault,
      associated_token_program: associatedTokenProgram,
      token_program: tokenProgram,
      systemProgram: SystemProgram.programId,
    };

    console.log(accountsPublicKeys);
  });

  it("make", async () => {
    const deposit = new BN(0.01 * LAMPORTS_PER_SOL);
    const receive = new BN(0.01 * LAMPORTS_PER_SOL);

    const accounts = {
      maker: accountsPublicKeys["maker"],
      mintA: accountsPublicKeys["mint_a"],
      mintB: accountsPublicKeys["mint_b"],
      makerAtaA: accountsPublicKeys["maker_ata_a"].address,
      escrow: accountsPublicKeys["escrow"],
      vault: accountsPublicKeys["vault"],
      associatedTokenProgram: accountsPublicKeys["associated_token_program"],
      tokenProgram: accountsPublicKeys["token_program"],
      systemProgram: accountsPublicKeys["system_program"],
    }

    await program.methods
      .make(seed, deposit, receive)
      .accounts(accounts)
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  it("take", async () => {
    const accounts = {
      taker: accountsPublicKeys["taker"],
      maker: accountsPublicKeys["maker"],
      mintA: accountsPublicKeys["mint_a"],
      mintB: accountsPublicKeys["mint_b"],
      takerAtaA: accountsPublicKeys["taker_ata_a"].address,
      takerAtaB: accountsPublicKeys["taker_ata_b"].address,
      makerAtaB: accountsPublicKeys["maker_ata_b"].address,
      escrow: accountsPublicKeys["escrow"],
      vault: accountsPublicKeys["vault"],
      associatedTokenProgram: accountsPublicKeys["associated_token_program"],
      tokenProgram: accountsPublicKeys["token_program"],
      systemProgram: accountsPublicKeys["system_program"],
    }

    await program.methods
      .take()
      .accounts(accounts)
      .signers([taker])
      .rpc()
      .then(confirm)
      .then(log);
  });

  it("refund", async () => {
    const accounts = {
      maker: accountsPublicKeys["maker"],
      mintA: accountsPublicKeys["mint_a"],
      makerAtaA: accountsPublicKeys["maker_ata_a"].address,
      escrow: accountsPublicKeys["escrow"],
      vault: accountsPublicKeys["vault"],
      associatedTokenProgram: accountsPublicKeys["associated_token_program"],
      tokenProgram: accountsPublicKeys["token_program"],
      systemProgram: accountsPublicKeys["system_program"],    }

    await program.methods
      .refund()
      .accounts(accounts)
      .signers([maker])
      .rpc()
      .then(confirm)
      .then(log);
  });
});
