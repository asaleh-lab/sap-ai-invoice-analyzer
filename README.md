# SAP AI invoice analyzer

## Run

Node.js 26.13.0.

```powershell
npm install
npm start
```

- Copy `.cdsrc-private.json.example` to `.cdsrc-private.json` and set `apiKey`. 

- Model name, base URL, and price tolerance are in `.cdsrc.json`.

- Open the publisher at [http://localhost:4004/publisher](http://localhost:4004/publisher) and send a sample invoice. 

- Open the workbench at [http://localhost:4004/workbench-ui](http://localhost:4004/workbench-ui).


## Screenshots

![Dashboard](screenshots/dashboard.png)

![Invoice detail](screenshots/detail.png)

![Pending cases](screenshots/pending.png)

![Chat](screenshots/chat-1.png)

![Follow-up chat](screenshots/chat-3.png)
