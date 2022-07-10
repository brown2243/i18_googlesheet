const EarnTranslation = require('./googleSheetAPI')
{
	;(async function () {
		const earnTranslation = new EarnTranslation()
		await earnTranslation.load()
		const sheet = earnTranslation.getSheet()
		const lngsPack = await earnTranslation.download(sheet)
		await earnTranslation.makeJSONFromLngsPack(lngsPack)
	})()
}
