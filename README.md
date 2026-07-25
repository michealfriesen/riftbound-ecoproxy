# Riftbound Eco Proxy

Riftbound Eco Proxy is a browser-based tool for finding Riftbound cards, building a proxy list, reviewing it, and printing it. It is a static HTML, CSS, and JavaScript project that loads card data from a remote service, so an internet connection is required.

## Launch locally

No dependencies or build step are required. From the repository root, start a local web server:

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in a browser. Stop the server with `Ctrl+C`.

Use **Add Cards** to search for individual cards or **Import List** to add multiple card IDs, then use **Print** to print the generated proxies.
