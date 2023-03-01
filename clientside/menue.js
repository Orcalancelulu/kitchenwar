document.getElementById("characterButton").addEventListener("click", changeToCharacterMenu);;
document.getElementById("done_button").addEventListener("click", changeToCharacterMenu);;


function changeToCharacterMenu() {
    if (document.getElementById("menue").style.display != "none") {
        document.getElementById("menue").style.display = "none";
        document.getElementById("chooseCharacters").style.display = "grid";

    } else {
        document.getElementById("menue").style.display = "grid";
        document.getElementById("chooseCharacters").style.display = "none";
    }
}
