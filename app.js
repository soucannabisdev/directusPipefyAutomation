const axios = require("axios")
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config()
const app = express();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.use(cors());
app.use(bodyParser.json());

async function directusRequest(query, data, method) {
    var requestData = [];

    let config = {
        method: method,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,Access-Control-Allow-Origin,Access-Control-Allow-Headers",
            Authorization: process.env.DIRECTUS_API_TOKEN,
        },
        maxBodyLength: Infinity,
        url: process.env.DIRECTUS_API_URL + query,
        data: data,
    };

    try {
        const response = await axios.request(config);

        return response.data;
    } catch (error) {
        console.log("Erro");
        console.log(error.response.data.errors);
    }
}

async function pipefyRequest(query) {

    let data = JSON.stringify({
        query: query,
        variables: {}
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.pipefy.com/graphql',
        headers: {
            'Authorization': process.env.PIPEFY_TOKEN,
            'Content-Type': 'application/json',
            'Cookie': '__cfruid=-1699643339'
        },
        data: data
    };

    const responseData = await axios.request(config)
    return responseData.data
}
app.post('/webhook', async (req, res) => {

    const documents = req.body.userData.documents
    const cardId = req.body.cardId
    
    var i = 0

  documents.forEach(async doc => {
        const documentInfo = await directusRequest("/items/Users_files/" + doc, " ", "GET")
        const urlFile = process.env.DIRECTUS_API_URL + "/assets/" + documentInfo.data.directus_files_id
   

        var namefile = await directusRequest("/files/" + documentInfo.data.directus_files_id, " ", "GET")
        namefile = namefile.data.filename_download
       
        // Baixar o arquivo para enviar via POST
        const downloadFile = await axios({
            method: 'GET',
            url: urlFile,
            responseType: 'stream'
        });

        var urlSubmit = await pipefyRequest('mutation { createPresignedUrl(input: { organizationId: ' + process.env.PIPEFY_ORGANIZATION + ', fileName: "' + namefile + '" }){ clientMutationId url } }')

        urlSubmit = urlSubmit.data.createPresignedUrl.url

        const file = downloadFile.data

        var formData = new FormData();
        formData.append("file", file);

        axios.request( {
            method: 'PUT',
            url: urlSubmit,
            headers: { 'Content-Type': 'multipart/form-data' },
            data: formData
        })

        var codFile = urlSubmit.split("/")      

        codFile = codFile[3]+"/"+codFile[4]+"/"+codFile[5]+"/"+codFile[6]+"/"+codFile[7]
        codFile = codFile.split("?")
        codFile = codFile[0]

       if(namefile.includes("RG")){
            var fieldId = "documento_pessoal_com_foto_do_respons_vel"
        }

        if(namefile.includes("RESIDENCIA")){
            var fieldId = "copy_of_documento_pessoal_com_foto_do_respons_vel"
        }

        if(namefile.includes("PACIENTE")){
            var fieldId = "documentos_pessoais_do_associado"
        }

        setTimeout(async function(){
            const upload = await pipefyRequest('mutation { updateCardField(input: {card_id: '+cardId+', field_id: "'+fieldId+'", new_value: ["'+codFile+'"]}) { clientMutationId success } }')
        },1500)

        i++
    });

    res.status(200).send("ok")
});



const PORT = 4000;
app.listen(PORT || process.env.PORT, () => {
    console.log(`Servser Started`+PORT || process.env.PORT,);
});
