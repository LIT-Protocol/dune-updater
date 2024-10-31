const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const bitcoin = require("bitcoinjs-lib");
const ecc = require("@bitcoin-js/tiny-secp256k1-asmjs");
const axios = require("axios");
const { throws } = require("assert");
bitcoin.initEccLib(ecc);
require("dotenv").config();

async function main() {
    console.log("Updating Genius WK Table");
    await updateGeniusWkTableData();
    console.log("Updating Yellowstone PKP Table");
    await updateYellowstonePkpTableData();
}

// ---------------------------- Constants for Dune API

const DUNE_API_KEY = process.env.DUNE_API_KEY;
const DUNE_API_BASE_URL = "https://api.dune.com/api/v1";
const DUNE_NAMESPACE = "lit_protocol";
const DUNE_TABLE_NAME_GENIUS_WK = "genius_wk_api";
const DUNE_QUERY_ID_GENIUS_WK = 4227011;
const DUNE_TABLE_NAME_YELLOWSTONE_PKP = "yellowstone_pkp_api";
const DUNE_QUERY_ID_YELLOWSTONE_PKP = 4228242;
const DUNE_TABLE_NAME_LATEST_BLOCKS = "latest_blocks_api";
const DUNE_QUERY_ID_LATEST_BLOCKS = 4228383;

// ---------------------------- Calls Genius API to fetch realtime data

async function updateGeniusWkTableData() {
    // Axios instance with default config
    const duneApi = axios.create({
        baseURL: DUNE_API_BASE_URL,
        headers: {
            "X-DUNE-API-KEY": DUNE_API_KEY,
        },
    });

    let g_wkCsv;

    try {
        // Clear existing table data
        console.log("Clearing existing data...");
        const clearResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_GENIUS_WK}/clear`
        );
        console.log("Clear Response:", clearResponse.data);
    } catch (error) {
        console.error("Error in clearing existing data:", error.message);
        return;
    }

    try {
        // Get updated data
        const wkCsv = await callGeniusAPI();
        g_wkCsv = wkCsv;
    } catch (error) {
        console.error("Error in fetching data from Genius API:", error.message);
        return;
    }

    try {
        // Update table with new data
        console.log("Updating table with new data...");
        const insertResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_GENIUS_WK}/insert`,
            g_wkCsv,
            {
                headers: {
                    "Content-Type": "text/csv",
                },
            }
        );
        console.log("Insert Response:", insertResponse.data);
    } catch (error) {
        console.error("Error in updating table with new data:", error.message);
        return;
    }

    try {
        // Refresh table by running query
        console.log("Refreshing Dune table...");
        const refreshResponse = await duneApi.post(
            `/query/${DUNE_QUERY_ID_GENIUS_WK}/execute`
        );
        console.log("Refresh Response:", refreshResponse.data);
    } catch (error) {
        console.error("Error in refreshing Dune table:", error.message);
        return;
    }
}

async function callGeniusAPI() {
    const API_URL =
        "https://staging-api.tradegenius.com/indexer/reports/wallets";
    const BATCH_SIZE = 1000;

    console.log("Starting data collection...");

    let allData = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        try {
            const response = await fetch(
                `${API_URL}?limit=${BATCH_SIZE}&offset=${offset}`
            );
            const result = await response.json();

            if (result.status !== "success") {
                throw new Error("API request failed");
            }

            const { data } = result;
            allData = [...allData, ...data];

            // Check if we've received less than the batch size
            if (data.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                offset += BATCH_SIZE;
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            hasMore = false;
        }
    }

    console.log(`Collected ${allData.length} wallet records`);

    const walletsWithKeyType = allData.map((item) => ({
        ...item,
        key_type: item.wallet_address.startsWith("0x")
            ? "secp256k1"
            : "ed25519",
    }));

    const csvContent = [
        "wallet_address,total_usd_value,key_type",
        ...walletsWithKeyType.map(
            (item) =>
                `${item.wallet_address},${item.total_usd_value},${item.key_type}`
        ),
    ].join("\n");

    return csvContent;
}

// ---------------------------- Scans Yellowstone blockchain for PKPs

async function updateYellowstonePkpTableData() {
    // Axios instance with default config
    const duneApi = axios.create({
        baseURL: DUNE_API_BASE_URL,
        headers: {
            "X-DUNE-API-KEY": DUNE_API_KEY,
        },
    });

    let g_pkpCsv, g_blocksCsv, startBlock;

    // Clear existing table data
    // try {
    //     console.log("Clearing Yellowstone Table's existing data...");
    //     const clearResponse = await duneApi.post(
    //         `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_YELLOWSTONE_PKP}/clear`
    //     );
    //     console.log("Clear Response:", clearResponse.data);
    // } catch (error) {
    //     console.error(
    //         "Error in clearing yellowstone pkp table:",
    //         error.message
    //     );
    // }

    // Fetch Blocks Table data
    try {
        console.log("Fetching latest block scan...");
        const fetchBlocksResponse = await duneApi.get(
            `/query/${DUNE_QUERY_ID_LATEST_BLOCKS}/results`
        );
        // setting end_block as the start block for the next scan
        startBlock = fetchBlocksResponse.data.result.rows[1].block_number;
        console.log(fetchBlocksResponse.data.result);
    } catch (error) {
        console.error("Error in fetching latest blocks:", error.message);
        return;
    }

    // Scan for new PKPs
    try {
        console.log("Scanning Yellowstone blockchain for PKPs...");
        const { pkpCsv, blocksCsv } = await scan(startBlock);
        g_pkpCsv = pkpCsv;
        g_blocksCsv = blocksCsv;
        console.log("PKP CSV data scanned successfully");
        console.log(blocksCsv);
    } catch (error) {
        console.error("Error in scanning pkp data:", error.message);
        return;
    }

    // Update Yellowstone table with new data
    try {
        console.log("Updating Yellowstone table with new data...");
        const insertResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_YELLOWSTONE_PKP}/insert`,
            g_pkpCsv,
            {
                headers: {
                    "Content-Type": "text/csv",
                },
            }
        );
        console.log("Insert Response:", insertResponse.data);
    } catch (error) {
        console.error(
            "Error in updating yellowstone pkp table:",
            error.message
        );
        return;
    }

    // Refresh Yellowstone table by running query
    try {
        console.log("Refreshing Yellowstone table on Dune...");
        const refreshResponse = await duneApi.post(
            `/query/${DUNE_QUERY_ID_YELLOWSTONE_PKP}/execute`
        );
        console.log("Refresh Response:", refreshResponse.data);
    } catch (error) {
        console.error(
            "Error in refreshing yellowstone pkp table:",
            error.message
        );
        return;
    }

    // Clear existing Blocks table data
    try {
        console.log("Clearing Blocks table's existing data...");
        const clearBlocksResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_LATEST_BLOCKS}/clear`
        );
        console.log("Clear Response:", clearBlocksResponse.data);
    } catch (error) {
        console.error("Error in clearing latest blocks table:", error.message);
        return;
    }

    // Update Blocks table
    try {
        console.log("Updating Blocks table in database...");
        const insertBlocksResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_LATEST_BLOCKS}/insert`,
            g_blocksCsv,
            {
                headers: {
                    "Content-Type": "text/csv",
                },
            }
        );
        console.log("Insert Blocks Response:", insertBlocksResponse.data);
    } catch (error) {
        console.error("Error in updating latest blocks table:", error.message);
        return;
    }

    // Refresh Blocks table by running query
    try {
        console.log("Refreshing Blocks table on Dune...");
        const refreshBlocksResponse = await duneApi.post(
            `/query/${DUNE_QUERY_ID_LATEST_BLOCKS}/execute`
        );
        console.log("Refresh Response:", refreshBlocksResponse.data);
    } catch (error) {
        console.error(
            "Error in refreshing latest blocks table:",
            error.message
        );
        return;
    }
}

// Define available blockchains with their respective RPC URLs and chain IDs
const blockchains = {
    chronicle: {
        rpcUrl:
            process.env.CHRONICLE_RPC_URL ||
            "https://chain-rpc.litprotocol.com/replica-http",
        chainId: 175177,
    },
    yellowstone: {
        rpcUrl:
            process.env.YELLOWSTONE_RPC_URL ||
            "https://yellowstone-rpc.litprotocol.com/",
        chainId: 175188,
    },
};

// Define the contracts (networks) with their respective addresses
const networks = {
    // cayenne: "0x58582b93d978F30b4c4E812A16a7b31C035A69f7",
    // habanero: "0x80182Ec46E3dD7Bb8fa4f89b48d303bD769465B2",
    // manzano: "0x3c3ad2d238757Ea4AF87A8624c716B11455c1F9A",
    // serrano: "0x8F75a53F65e31DD0D2e40d0827becAaE2299D111",
    datil_prod: "0x487A9D096BB4B7Ac1520Cb12370e31e677B175EA",
    datil_dev: "0x02C4242F72d62c8fEF2b2DB088A35a9F4ec741C7",
    datil_test: "0x6a0f439f064B7167A8Ea6B22AcC07ae5360ee0d1",
};

// ABI for the contract, including the PKPMinted event and getEthAddress function
const contractABI = [
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "uint256",
                name: "tokenId",
                type: "uint256",
            },
            {
                indexed: false,
                internalType: "bytes",
                name: "pubkey",
                type: "bytes",
            },
        ],
        name: "PKPMinted",
        type: "event",
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "tokenId",
                type: "uint256",
            },
        ],
        name: "getEthAddress",
        outputs: [
            {
                internalType: "address",
                name: "",
                type: "address",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
];

async function fetchPKPs(
    startBlock,
    endBlock,
    _blockchain,
    _network,
    _provider
) {
    // Retrieve configuration from environment variables
    const selectedBlockchain = _blockchain;
    const selectedNetwork = _network;
    const provider = _provider;
    const blockInterval = parseInt(process.env.BLOCK_INTERVAL, 10) || 25000;

    // Ensure both blockchain and network are specified
    if (!selectedBlockchain) {
        throw new Error(
            "Both BLOCKCHAIN must be specified in the environment variables."
        );
    }

    let results = [];
    const networksToUse =
        selectedNetwork === "all" ? Object.keys(networks) : [selectedNetwork];

    // Iterate over each selected network (contract)
    for (const network of networksToUse) {
        // Get the contract address for the specified network
        const contractAddress = networks[network];
        if (!contractAddress) {
            throw new Error(`Invalid network specified: ${selectedNetwork}`);
        }

        const contract = new ethers.Contract(
            contractAddress,
            contractABI,
            provider
        );

        // Iterate through the blocks in intervals to query events
        for (
            let fromBlock = startBlock;
            fromBlock <= endBlock;
            fromBlock += blockInterval
        ) {
            const toBlock = Math.min(fromBlock + blockInterval - 1, endBlock);
            const filter = {
                address: contractAddress,
                fromBlock: fromBlock,
                toBlock: toBlock,
                topics: [ethers.utils.id("PKPMinted(uint256,bytes)")],
            };

            try {
                // Query events for the specified range of blocks
                const events = await contract.queryFilter(
                    filter,
                    fromBlock,
                    toBlock
                );
                console.log(
                    `Found ${events.length} PKPMinted events from block ${fromBlock} to ${toBlock} on ${selectedBlockchain} blockchain and ${network} network`
                );
                for (const event of events) {
                    const tokenId = event.args.tokenId.toString();
                    const publicKey = event.args.pubkey;
                    const { p2pkh, p2wpkh, p2shP2wpkh, p2tr, p2wsh, p2sh } =
                        calculateBtcAddresses(publicKey);
                    try {
                        // Fetch the ETH address associated with the tokenId
                        const ethAddress = await contract.getEthAddress(
                            tokenId
                        );
                        const result = `Blockchain: ${selectedBlockchain}, Network: ${network}, Token ID: ${tokenId} -> ETH Address: ${ethAddress}`;
                        console.log(result);
                        results.push({
                            blockchain: selectedBlockchain,
                            network: network,
                            tokenId,
                            ethAddress,
                            p2pkh,
                            p2wpkh,
                            p2shP2wpkh,
                            p2tr,
                            p2wsh,
                            p2sh,
                        });
                    } catch (error) {
                        console.error(
                            `Error fetching ETH address for Token ID ${tokenId} on ${selectedBlockchain} blockchain, ${selectedNetwork} network:`,
                            error
                        );
                    }
                }
            } catch (error) {
                console.error(
                    `Error fetching events from block ${fromBlock} to ${toBlock} on ${selectedBlockchain} blockchain, ${selectedNetwork} network:`,
                    error
                );
            }

            // Add a delay between queries to avoid overloading the provider
            await new Promise((res) => setTimeout(res, 2000)); // 2 second delay
        }
    }

    // Format and return results
    results = cleanArray(results);
    return results;
}

function calculateBtcAddresses(publicKey) {
    if (publicKey.startsWith("0x")) {
        publicKey = publicKey.slice(2);
    }

    // Check if the public key is in uncompressed format (starts with 04)
    const isUncompressed = publicKey.startsWith("04");
    let pubKeyBuffer;

    if (isUncompressed) {
        pubKeyBuffer = Buffer.from(
            ecc.pointCompress(Buffer.from(publicKey, "hex"), true)
        );
    } else {
        pubKeyBuffer = Buffer.from(publicKey, "hex");
    }

    const network = bitcoin.networks.bitcoin;

    // P2PKH (Legacy address)
    const p2pkh = bitcoin.payments.p2pkh({
        pubkey: pubKeyBuffer,
        network,
    }).address;

    // P2WPKH (Native SegWit address)
    const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: pubKeyBuffer,
        network,
    }).address;

    // P2SH-P2WPKH (Nested SegWit address)
    const p2shP2wpkh = bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey: pubKeyBuffer, network }),
        network,
    }).address;

    // P2TR (Taproot address)
    const p2tr = bitcoin.payments.p2tr({
        internalPubkey: pubKeyBuffer.slice(1),
        network,
    }).address;

    // P2WSH (Pay-to-Witness-Script-Hash)
    const p2wsh = bitcoin.payments.p2wsh({
        redeem: bitcoin.payments.p2pk({ pubkey: pubKeyBuffer, network }),
        network,
    }).address;

    // P2SH (Pay-to-Script-Hash) - Example with P2PK script
    const p2sh = bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2pk({ pubkey: pubKeyBuffer, network }),
        network,
    }).address;

    return { p2pkh, p2wpkh, p2shP2wpkh, p2tr, p2wsh, p2sh };
}

function cleanArray(dataArray) {
    // Remove rows with empty values
    const cleanedData = dataArray.filter((row) =>
        Object.values(row).every(
            (value) => value !== "" && value !== null && value !== undefined
        )
    );

    // Rename columns
    const renamedData = cleanedData.map((row) => ({
        blockchain: row["blockchain"],
        network: row["network"],
        token_id: row["tokenId"],
        eth_address: row["ethAddress"],
        btcP2PKH: row["p2pkh"],
        btcP2WPKH: row["p2wpkh"],
        btcP2SHP2WPKH: row["p2shP2wpkh"],
        btcP2TR: row["p2tr"],
        btcP2WSH: row["p2wsh"],
        btcP2SH: row["p2sh"],
    }));

    return renamedData;
}

function convertToCSV(data) {
    const headers =
        "blockchain,network,token_id,eth_address,btc_p2pkh,btc_p2wpkh,btc_p2shp2wpkh,btc_p2tr,btc_p2wsh,btc_p2sh";
    const rows = data
        .map(
            (row) =>
                `${row.blockchain},${row.network},${row.token_id},${row.eth_address},${row.btcP2PKH},${row.btcP2WPKH},${row.btcP2SHP2WPKH},${row.btcP2TR},${row.btcP2WSH},${row.btcP2SH}`
        )
        .join("\n");
    return `${headers}\n${rows}`;
}

const CSV_DIR = "csv";

const getFormattedDate = () => {
    const date = new Date();
    return {
        day: date.getDate().toString().padStart(2, "0"),
        month: (date.getMonth() + 1).toString().padStart(2, "0"),
        year: date.getFullYear().toString().slice(-2),
    };
};

function writePkpCSV(_data) {
    if (!fs.existsSync(CSV_DIR)) {
        fs.mkdirSync(CSV_DIR);
        console.log("Created csv directory");
    }
    const { day, month, year } = getFormattedDate();

    const fileName = `pkp-${day}-${month}-${year}.csv`;
    const filePath = path.join(CSV_DIR, fileName);

    fs.writeFileSync(filePath, _data);
    console.log(`PKP CSV data exported successfully to ${filePath}`);
}

function writeBlocksCSV(_startBlock, _endBlock) {
    const csvHeader = "block_type,block_number\n";
    const csvData = `start,${_startBlock}\nend,${_endBlock}`;
    const fullCsvContent = csvHeader + csvData;

    if (!fs.existsSync(CSV_DIR)) {
        fs.mkdirSync(CSV_DIR);
        console.log("Created csv directory");
    }

    const { day, month, year } = getFormattedDate();

    const fileName = `block-${day}-${month}-${year}.csv`;
    const filePath = path.join(CSV_DIR, fileName);

    fs.writeFileSync(filePath, fullCsvContent);
    console.log(`Block CSV data exported successfully to ${filePath}`);
}

async function scan(startBlock) {
    const blockchain = process.env.BLOCKCHAIN;

    const { rpcUrl, chainId } = blockchains[blockchain];
    if (!rpcUrl || !chainId) {
        throw new Error(`Invalid blockchain specified: ${selectedBlockchain}`);
    }
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
        name: blockchain,
        chainId,
    });

    const endBlock = 888575;
    // const endBlock = await provider.getBlockNumber();

    if (startBlock == endBlock) {
        console.error("No new blocks to scan");
        return;
    }
    const network = process.env.NETWORK || "all";

    console.log("endBlock: ", endBlock);

    const PKPs = await fetchPKPs(
        startBlock,
        endBlock,
        blockchain,
        network,
        provider
    );

    const pkpCsv = convertToCSV(PKPs);
    const blocksHeader = "block_type,block_number\n";
    const blocksRows = `start,${startBlock}\nend,${endBlock}`;
    const blocksCsv = blocksHeader + blocksRows;

    return { pkpCsv, blocksCsv };
}

// ---------------------------- manual control/initialization for yellowstone pkp table

async function pushYellowstoneCSVToDune() {
    // Axios instance with default config
    const duneApi = axios.create({
        baseURL: DUNE_API_BASE_URL,
        headers: {
            "X-DUNE-API-KEY": DUNE_API_KEY,
        },
    });

    // Clear existing Blocks table data
    try {
        console.log("Clearing existing data...");
        const clearBlocksResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_YELLOWSTONE_PKP}/clear`
        );
        console.log("Clear Response:", clearBlocksResponse.data);
    } catch (error) {
        console.error("Error in clearing latest blocks table:", error.message);
        return;
    }

    let g_pkpCsv = fs.readFileSync("csv/yellowstone_31_10_24.csv", "utf8");

    // Update table with new data
    try {
        console.log("Updating table with new data...");
        const insertResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_YELLOWSTONE_PKP}/insert`,
            g_pkpCsv,
            {
                headers: {
                    "Content-Type": "text/csv",
                },
            }
        );
        console.log("Insert Response:", insertResponse.data);
    } catch (error) {
        console.error(
            "Error in updating yellowstone pkp table:",
            error.message
        );
        return;
    }

    // Refresh Yellowstone table by running query
    try {
        console.log("Refreshing Yellowstone table on Dune...");
        const refreshResponse = await duneApi.post(
            `/query/${DUNE_QUERY_ID_YELLOWSTONE_PKP}/execute`
        );
        console.log("Refresh Response:", refreshResponse.data);
    } catch (error) {
        console.error(
            "Error in refreshing yellowstone pkp table:",
            error.message
        );
        return;
    }
}

// ---------------------------- manual control/initialization for blocks table

async function pushBlocksCSVToDune() {
    // Axios instance with default config
    const duneApi = axios.create({
        baseURL: DUNE_API_BASE_URL,
        headers: {
            "X-DUNE-API-KEY": DUNE_API_KEY,
        },
    });

    // Clear existing Blocks table data
    try {
        console.log("Clearing existing data...");
        const clearBlocksResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_LATEST_BLOCKS}/clear`
        );
        console.log("Clear Response:", clearBlocksResponse.data);
    } catch (error) {
        console.error("Error in clearing latest blocks table:", error.message);
        return;
    }

    let g_blocksCsv = fs.readFileSync("csv/blocks_31_10_24.csv", "utf8");

    // Update Blocks table
    try {
        console.log("Updating Blocks table in database...");
        const insertBlocksResponse = await duneApi.post(
            `/table/${DUNE_NAMESPACE}/${DUNE_TABLE_NAME_LATEST_BLOCKS}/insert`,
            g_blocksCsv,
            {
                headers: {
                    "Content-Type": "text/csv",
                },
            }
        );
        console.log("Insert Blocks Response:", insertBlocksResponse.data);
    } catch (error) {
        console.error("Error in updating latest blocks table:", error.message);
    }

    // Refresh Blocks table by running query
    try {
        console.log("Refreshing Blocks table on Dune...");
        const refreshBlocksResponse = await duneApi.post(
            `/query/${DUNE_QUERY_ID_LATEST_BLOCKS}/execute`
        );
        console.log("Refresh Response:", refreshBlocksResponse.data);
    } catch (error) {
        console.error(
            "Error in refreshing latest blocks table:",
            error.message
        );
        return;
    }
}

// pushYellowstoneCSVToDune();
// pushBlocksCSVToDune();
// updateGeniusWkTableData();
// updateYellowstonePkpTableData();

main();