const EarnTranslation = require("./googleSheetAPI");
{
  (async function () {
    const earnTranslation = new EarnTranslation();
    await earnTranslation.load();
    const sheet = earnTranslation.getSheet();
    await earnTranslation.uploadJSOMWithNewKeys(sheet);
  })();
}
