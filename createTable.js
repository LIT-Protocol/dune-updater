const axios = require("axios");

const DUNE_URL = "https://api.dune.com/api/v1"

async function createTable() {
    const schema = [
        { name: "network", type: "varchar" },
        { name: "pkp_address", type: "varchar" },
        { name: "public_key", type: "varchar" },
    ];

    let dune_namespace = process.env.DUNE_NAMESPACE;
    let table_name = "k256_wk_api";

    const endpoint = `/table/create`;
    const url = `${DUNE_URL}${endpoint}`;

    const payload = {
        namespace: dune_namespace,
        table_name: table_name,
        description: "genius wrapped keys from api",
        schema: schema,
        is_private: false,
    };

    const headers = {
        "X-DUNE-API-KEY": `${process.env.DUNE_API_KEY}`,
        "Content-Type": "application/json",
    };

    try {
        const response = await axios.post(url, payload, {
            headers,
        });
        return response;
    } catch (error) {
        console.error("Error updating Dune table:", error);
        throw error;
    }
}

createTable()