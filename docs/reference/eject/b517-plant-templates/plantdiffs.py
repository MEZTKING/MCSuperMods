ATTACH_HEAD = """    Rules rules() {
        return rules;
    }

    /** The strand companion, registered right after the tip ({@code ModBlocks}). */
    public void attachBody(Block body) {
        rules.attach(body);
    }
"""
ATTACH_WATER = ATTACH_HEAD.replace('\n    ', '\n        ').replace('    Rules rules()', '        Rules rules()', 1)
DIFFS = {
'MsmGrowingPlantHeadBlock': [
("""    /** The tip of {@code definition}: a dry plant or a water plant, with or without berries. */
    public static Block create(Identifier id, BlockDefinition definition, Properties props) {
        PlantSpec.GrowingPlant fields = (PlantSpec.GrowingPlant) definition.typeFields();
        SETUP.set(fields.berries().isPresent());
        try {
            return fields.needsWater() ? new Water(id, definition, props) : new ModGrowingPlantHeadBlock(id, definition, fields, props);
        } finally {
            SETUP.remove();
        }
    }
""", """    /** {@code props}, after marking whether the states being built have berries; called inside the constructors' {@code super}. */
    static Properties setup(PlantSpec.GrowingPlant fields, Properties props) {
        SETUP.set(fields.berries().isPresent());
        return props;
    }
"""),
("""    private ModGrowingPlantHeadBlock(Identifier id, BlockDefinition definition, PlantSpec.GrowingPlant fields, Properties props) {
        super(props, direction(fields), headShape(fields), false, fields.growthChance());
        this.rules = new Rules(this, id, definition);""", """    public ModGrowingPlantHeadBlock(PlantSpec.GrowingPlant fields, Properties props) {
        super(setup(fields, props), direction(fields), headShape(fields), false, fields.growthChance());
        SETUP.remove();
        this.rules = new Rules(this, fields);"""),
("""        Water(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.rules = new Rules(this, id, definition);
            this.growthChance = ((PlantSpec.GrowingPlant) definition.typeFields()).growthChance();""", """        public Water(PlantSpec.GrowingPlant fields, Properties props) {
            super(setup(fields, props));
            SETUP.remove();
            this.rules = new Rules(this, fields);
            this.growthChance = fields.growthChance();"""),
("""    Rules rules() {
        return rules;
    }
""", ATTACH_HEAD),
("""        Rules rules() {
            return rules;
        }
""", ATTACH_WATER),
("""        Rules(Block block, Identifier id, BlockDefinition definition) {
            this.block = block;
            this.fields = (PlantSpec.GrowingPlant) definition.typeFields();""", """        Rules(Block block, PlantSpec.GrowingPlant fields) {
            this.block = block;
            this.fields = fields;"""),
("""            if (body == null) {
                Optional<Block> found = Companions.companionOf(block);
                if (found.isEmpty()) {
                    return block;
                }
                body = found.get();
            }
            return body;
        }
""", """            return body == null ? block : body;
        }

        void attach(Block companion) {
            body = companion;
        }
"""),
],
'MsmGrowingPlantBodyBlock': [
("""    /** The strand of {@code head}, a dry tip or a {@link ModGrowingPlantHeadBlock.Water} tip. */
    static Block create(Identifier id, BlockDefinition definition, Block head, Properties props) {
        PlantSpec.GrowingPlant fields = (PlantSpec.GrowingPlant) definition.typeFields();
        ModGrowingPlantHeadBlock.SETUP.set(fields.berries().isPresent());
        try {
            return head instanceof ModGrowingPlantHeadBlock.Water water ? new Water(id, definition, water, props)
                    : new ModGrowingPlantBodyBlock(id, definition, (ModGrowingPlantHeadBlock) head, fields, props);
        } finally {
            ModGrowingPlantHeadBlock.SETUP.remove();
        }
    }

""", ""),
("""    private ModGrowingPlantBodyBlock(Identifier id, BlockDefinition definition, ModGrowingPlantHeadBlock head,
            PlantSpec.GrowingPlant fields, Properties props) {
        super(props, ModGrowingPlantHeadBlock.direction(fields), bodyShape(fields), false);
        this.head = head;
        this.rules = new ModGrowingPlantHeadBlock.Rules(this, id, definition);""", """    public ModGrowingPlantBodyBlock(PlantSpec.GrowingPlant fields, ModGrowingPlantHeadBlock head, Properties props) {
        super(ModGrowingPlantHeadBlock.setup(fields, props), ModGrowingPlantHeadBlock.direction(fields), bodyShape(fields), false);
        ModGrowingPlantHeadBlock.SETUP.remove();
        this.head = head;
        this.rules = new ModGrowingPlantHeadBlock.Rules(this, fields);"""),
("""        Water(Identifier id, BlockDefinition definition, ModGrowingPlantHeadBlock.Water head, Properties props) {
            super(props);
            this.head = head;
            this.rules = new ModGrowingPlantHeadBlock.Rules(this, id, definition);""", """        public Water(PlantSpec.GrowingPlant fields, ModGrowingPlantHeadBlock.Water head, Properties props) {
            super(ModGrowingPlantHeadBlock.setup(fields, props));
            ModGrowingPlantHeadBlock.SETUP.remove();
            this.head = head;
            this.rules = new ModGrowingPlantHeadBlock.Rules(this, fields);"""),
],
'MsmColumnPlantBlock': [
("""        Cane(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.fields = (PlantSpec.ColumnPlant) definition.typeFields();""", """        public Cane(PlantSpec.ColumnPlant fields, Properties props) {
            super(props);
            this.fields = fields;"""),
("""        Cactus(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.fields = (PlantSpec.ColumnPlant) definition.typeFields();""", """        public Cactus(PlantSpec.ColumnPlant fields, Properties props) {
            super(props);
            this.fields = fields;"""),
],
'MsmBambooBlock': [
("""    ModBambooBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.fields = (PlantSpec.ColumnPlant) definition.typeFields();""", """    public ModBambooBlock(PlantSpec.ColumnPlant fields, Properties props) {
        super(props);
        this.fields = fields;"""),
("""    /** The shoot companion, once registered. */
    public Optional<Block> shoot() {
        return Companions.companionOf(this);
    }""", """    private Block shoot;

    /** The shoot companion, registered right after the stalk ({@code ModBlocks}). */
    public void attachShoot(Block companion) {
        shoot = companion;
    }

    /** The shoot companion, once registered. */
    public Optional<Block> shoot() {
        return Optional.ofNullable(shoot);
    }"""),
],
'MsmBambooShootBlock': [
("""    ModBambooShootBlock(Identifier id, BlockDefinition definition, ModBambooBlock stalk, Properties props) {""",
 """    public ModBambooShootBlock(ModBambooBlock stalk, Properties props) {"""),
],
'MsmMultifaceBlock': [
("""    ModMultifaceBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.fields = (PlantSpec.Multiface) definition.typeFields();""", """    public ModMultifaceBlock(PlantSpec.Multiface fields, Properties props) {
        super(props);
        this.fields = fields;"""),
],
'MsmBigDripleafBlock': [
("""    ModBigDripleafBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.tiltTicks = ((PlantSpec.Dripleaf) definition.typeFields()).tiltTicks();""", """    public ModBigDripleafBlock(PlantSpec.Dripleaf fields, Properties props) {
        super(props);
        this.tiltTicks = fields.tiltTicks();"""),
("""        return Companions.companionOf(this);
    }""", """        return Optional.ofNullable(stem);
    }

    private Block stem;

    /** The stem companion, registered right after the leaf ({@code ModBlocks}). */
    public void attachStem(Block companion) {
        stem = companion;
    }"""),
],
'MsmDripleafStemBlock': [
("""    ModDripleafStemBlock(Identifier id, BlockDefinition definition, ModBigDripleafBlock leaf, Properties props) {""",
 """    public ModDripleafStemBlock(ModBigDripleafBlock leaf, Properties props) {"""),
],
'MsmSmallDripleafBlock': [
("""    ModSmallDripleafBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.growsInto = ((PlantSpec.Dripleaf) definition.typeFields()).growsInto().orElseThrow();""", """    public ModSmallDripleafBlock(PlantSpec.Dripleaf fields, Properties props) {
        super(props);
        this.growsInto = fields.growsInto().orElseThrow();"""),
],
'MsmFlowerPotBlock': [
("""    public ModFlowerPotBlock(Identifier id, BlockDefinition definition, Block plant, ModFlowerPotBlock emptyPot,
            Properties properties) {""", """    public ModFlowerPotBlock(Block plant, ModFlowerPotBlock emptyPot, Properties properties) {"""),
("""    void addPotted(""", """    public void addPotted("""),
("""            return own.consumesAction() ? own : InteractionResult.CONSUME;""", """            return InteractionResult.CONSUME;"""),
],
}
