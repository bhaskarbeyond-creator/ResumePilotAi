
class Language{
    constructor(id,name="not-set",level="not-set"){
        this.id = id;
        this.name=name;
        this.level = level;
        // Cv51 specific CEFR fields
        this.listening = null;
        this.reading = null;
        this.spokenInteraction = null;
        this.spokenProduction = null;
        this.writing = null;
    }
}
export default Language;