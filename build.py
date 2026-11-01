import base64, json, os, re

SNAPSHOT = "assets/snapshot-raw.json"


def preview_data():
    """Real names from a past tournament: kept out of git, used only for the preview."""
    raw = open(SNAPSHOT, encoding="utf8").read()
    snapshot = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])

    # Preview only: real Mussibad matches moved onto a 5-court hall, chosen to show club players.
    COURT_OF_MATCH = {593: 1, 595: 2, 591: 3, 594: 4, 589: 5}
    CALLED_FROM_SNAPSHOT = [596, 582]

    live = []
    called = []
    for row in snapshot["rows"]:
        if not row["court"]:
            continue
        draw, step, num = row["draw"]
        number = int(re.sub(r"\D", "", num))
        if number in CALLED_FROM_SNAPSHOT:
            called.append({"num": number, "draw": draw, "round": step, "a": row["a"], "b": row["b"]})
        if number not in COURT_OF_MATCH:
            continue
        match = {
            "court": COURT_OF_MATCH[number],
            "dur": int(row["dur"].split()[0]),
            "draw": draw,
            "round": step,
            "num": int(re.sub(r"\D", "", num)),
            "a": row["a"],
            "b": row["b"],
        }
        top, bottom = row["sc"]
        if top[0] and bottom[0]:
            match["score"] = [int(top[0]), int(bottom[0])]
        live.append(match)


    def player(name, club):
        return {"n": name, "i": club}


    called.sort(key=lambda m: CALLED_FROM_SNAPSHOT.index(m["num"]))
    queue = called + [
        {"num": 588, "draw": "DH S08", "round": "A Tr 5",
         "a": [player("LEROY Noé", "BMMC57"), player("MOREAU Jade", "BCHS57")],
         "b": [player("SIMON Tom", "TTOUBAD54"), player("LAURENT Chloé", "TTOUBAD54")]},
        {"num": 590, "draw": "DH S08", "round": "A Tr 5",
         "a": [player("MICHEL Arthur", "ABC57"), player("GARCIA Lina", "ASBPAM54")],
         "b": [player("DAVID Hugo", "ASBPAM54"), player("BERTRAND Zoé", "ASBPAM54")]},
        {"num": 584, "draw": "DH S06", "round": "A Tr 5",
         "a": [player("ROUX Louis", "ASBPAM54"), player("VINCENT Emma", "ASBPAM54")],
         "b": [player("FOURNIER Paul", "BCL52"), player("MOREL Lucie", "BCD21")]},
        {"num": 581, "draw": "DH S05", "round": "A Tr 5",
         "a": [player("LEFEBVRE-DUMONT Maximilien", "MBSMB57"), player("GIRARD Marc", "MBSMB57")],
         "b": [player("ANDRE Victor", "RB57"), player("MERCIER Rose", "RB57")]},
        {"num": 579, "draw": "DH S05", "round": "A Tr 5",
         "a": [player("BLANC Nina", "MBSMB57"), player("GUERIN Axel", "MBSMB57")],
         "b": [player("BOYER Manon", "CB54"), player("CHEVALIER Sam", "ASCNB54")]},
    ]

    # Show a long name early, so the sliding effect is visible in the preview.
    queue.sort(key=lambda m: m["num"] != 581)
    return json.dumps({"LIVE": live, "QUEUE": queue}, ensure_ascii=False)


logo = "data:image/png;base64," + base64.b64encode(open("assets/logo.png", "rb").read()).decode()
page = open("src/page.html", encoding="utf8").read().replace("/*LOGO*/", logo)
screen = open("src/screen.js", encoding="utf8").read()
feed = open("src/feed.js", encoding="utf8").read()
start = open("src/start.js", encoding="utf8").read()

head = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
"""
styles_end = page.index("</style>") + len("</style>")
os.makedirs("dist", exist_ok=True)
with open("dist/index.html", "w", encoding="utf8") as out:
    out.write(f"{head}{page[:styles_end]}\n</head>\n<body>\n{page[styles_end:]}"
              f"<script>{start}</script>\n<script>{feed}</script>\n<script>{screen}</script>\n"
              "<script>EcranStart.begin();</script>\n</body>\n</html>\n")
print("dist", os.path.getsize("dist/index.html"))

if os.path.exists(SNAPSHOT):
    preview = open("src/preview.js", encoding="utf8").read()
    with open("index.html", "w", encoding="utf8") as out:
        out.write(f"{page}<script>{screen}</script>\n<script>window.PREVIEW_DATA = {preview_data()};</script>\n<script>{preview}</script>\n")
    print("preview", os.path.getsize("index.html"))
